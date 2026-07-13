import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { slugify } from "@/lib/slug";
import { S3_BUCKET, s3Client, s3Configured, keyFromOwnBucketUrl, headS3Object } from "@/lib/s3";
import { ASSET_CATEGORY_LABELS, isAssetCategory } from "@/lib/asset";
import { buildLyricsTxt, buildLrcEntries } from "@/lib/lyrics-export";
import { createStoreZipStream, type ZipStreamEntry } from "@/lib/zip-stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Store-only zip has no zip64, so the whole bundle must stay under 4 GB.
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

/** ".mp3" etc. from a URL, or "" — for naming files inside the archive. */
function ext(url: string): string {
  const m = (url.split("?")[0] ?? "").match(/\.([a-z0-9]{1,5})$/i);
  return m ? `.${m[1]}` : "";
}
/** Strip path separators so a name can't create stray folders / escape the entry. */
function safeName(s: string): string {
  return (s || "file").replace(/[/\\]+/g, "_").trim() || "file";
}

// GET /api/releases/[releaseId]/assets/download
//
// Bundle EVERY file for a release — cover, per-track audio/stems/art, any assets
// tagged to it in the DAM, plus synthesized lyrics (.txt + per-track .lrc) — into
// one streamed .zip, so an admin downloads them together instead of one by one.
// Files are piped from S3 through a streaming zip (lib/zip-stream) so large audio
// masters never buffer in memory. Catalog-gated; only our own-bucket files.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;

  if (!s3Configured() || !s3Client) {
    return NextResponse.json({ error: "File storage is not configured" }, { status: 500 });
  }

  const { releaseId } = await params;
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      name: true,
      coverImage: true,
      tracks: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, audioFile: true, stemsFile: true, image: true, lyrics: true, syncedLyrics: true },
      },
    },
  });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

  const damAssets = await prisma.asset.findMany({
    where: { releaseId },
    select: { fileName: true, fileUrl: true, category: true },
  });

  // Collect candidate files as { path-in-zip, s3 key }, de-duped by key so a DAM
  // asset that mirrors a catalog URL isn't bundled twice.
  const seen = new Set<string>();
  const candidates: { path: string; key: string }[] = [];
  const add = (folder: string, name: string, url: string | null | undefined) => {
    if (!url) return;
    const key = keyFromOwnBucketUrl(url); // null for external / non-bucket URLs → skipped
    if (!key || seen.has(key)) return;
    seen.add(key);
    candidates.push({ path: `${folder}/${safeName(name)}`, key });
  };

  add("Artwork", `cover${ext(release.coverImage)}`, release.coverImage);
  release.tracks.forEach((t, i) => {
    const n = String(i + 1).padStart(2, "0");
    add("Audio", `${n} ${t.name}${ext(t.audioFile ?? "")}`, t.audioFile);
    add("Stems", `${n} ${t.name}${ext(t.stemsFile ?? "")}`, t.stemsFile);
    add("Artwork", `${n} ${t.name}${ext(t.image ?? "")}`, t.image);
  });
  for (const a of damAssets) {
    const folder = isAssetCategory(a.category) ? ASSET_CATEGORY_LABELS[a.category] : "Other";
    add(folder, a.fileName, a.fileUrl);
  }

  // HEAD in parallel to drop dangling references and total the size (a clean
  // archive, and the 4 GB guard, without reading any bodies yet).
  const heads = await Promise.all(
    candidates.map(async (c) => ({ c, head: await headS3Object(c.key) }))
  );
  const present = heads.filter((h) => h.head !== null);
  const totalBytes = present.reduce((n, h) => n + (h.head?.size ?? 0), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "This release is too large to bundle — download files individually." },
      { status: 413 }
    );
  }

  // Lyrics are synthesized from track text (not stored files).
  const txt = buildLyricsTxt(release.tracks);
  const lrc = buildLrcEntries(release.tracks);

  if (present.length === 0 && !txt && lrc.length === 0) {
    return NextResponse.json({ error: "Nothing to download for this release" }, { status: 404 });
  }

  // Lazily open each S3 object only when the zip writer reaches it — one stream at
  // a time, so memory stays bounded regardless of release size.
  const s3Body = (key: string): AsyncIterable<Uint8Array> => ({
    async *[Symbol.asyncIterator]() {
      const out = await s3Client!.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      const body = out.Body as unknown as AsyncIterable<Uint8Array> | undefined;
      if (!body) return;
      for await (const chunk of body) yield chunk;
    },
  });

  const enc = new TextEncoder();
  const entries: ZipStreamEntry[] = present.map((h) => ({ name: h.c.path, body: s3Body(h.c.key) }));
  const base = slugify(release.name) || "release";
  if (txt) entries.push({ name: `Lyrics/${base}-lyrics.txt`, body: enc.encode(txt) });
  for (const e of lrc) entries.push({ name: `Lyrics/${safeName(e.name)}`, body: enc.encode(e.data) });

  const stream = createStoreZipStream(entries);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${base}-assets.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
