import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-guard";
import { fileNameFromUrl, guessMimeFromUrl, isUsableFileUrl } from "@/lib/asset";
import { assetDownloadHref, assetViewHref, isOwnBucketUrl } from "@/lib/s3";
import AssetsClient, { type Asset, type Option } from "./AssetsClient";

// The Download action routes through our same-origin shim (which forces a real
// file download via a presigned S3 Content-Disposition) for files WE host; an
// external URL keeps its direct link.
function downloadHrefFor(url: string, name: string): string {
  return isOwnBucketUrl(url) ? assetDownloadHref(url, name) : url;
}
// `viewHref` (below) is the open/preview target: public media keeps its direct
// (CDN-cacheable, next/image-optimizable) bucket URL, while a private object —
// DAM masters, stems, EPKs, documents — gets the authorization-gated shim, so
// its raw URL never reaches the page (audit #1).

export const dynamic = "force-dynamic";

type DerivedInput = {
  id: string;
  category: string;
  title: string;
  url: string | null | undefined;
  source: Asset["source"];
  parentHref: string;
  parentLabel: string;
  createdAt: string;
  releaseId?: string;
  artistId?: string;
};

export default async function AssetsPage() {
  // Revocation-aware gate before reading the DAM (may include private masters/
  // stems/contracts) — middleware is token-only. Matches the API's catalog:read.
  await requirePagePermission("catalog:read");

  let assets: Asset[] = [];
  let releases: Option[] = [];
  let artists: Option[] = [];
  let releaseLyrics: Record<string, { txt: boolean; lrc: boolean }> = {};
  // release id → its first primary artist id, so "Group by artist" can also file a
  // release's assets (covers/masters/stems) under that release's artist.
  let releaseArtistId: Record<string, string> = {};
  // release id → ALL primary artist ids, so the Artist column can show every
  // credited artist ("BSK, BigHeck") instead of silently dropping co-artists.
  let releaseArtistIds: Record<string, string[]> = {};
  try {
    const [rows, rels, arts, press] = await Promise.all([
      prisma.asset.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.release.findMany({
        select: {
          id: true, name: true, coverImage: true, createdAt: true, primaryArtistIds: true,
          tracks: { select: { id: true, name: true, audioFile: true, stemsFile: true, image: true, lyrics: true, syncedLyrics: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.artist.findMany({ select: { id: true, name: true, profilePicture: true, createdAt: true }, orderBy: { name: "asc" } }),
      prisma.pressItem
        .findMany({ select: { id: true, title: true, image: true, createdAt: true }, orderBy: { createdAt: "desc" } })
        .catch(() => [] as { id: string; title: string; image: string | null; createdAt: Date }[]),
    ]);

    const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter((v): v is string => !!v))];
    const users = uploaderIds.length
      ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true, email: true } })
      : [];
    const uploaderName = new Map(users.map((u) => [u.id, u.name || u.email || "Unknown"]));

    // Files uploaded directly through the DAM (editable/deletable).
    const damAssets: Asset[] = rows.map((a) => ({
      id: a.id, category: a.category, title: a.title, fileName: a.fileName, fileUrl: a.fileUrl,
      downloadHref: downloadHrefFor(a.fileUrl, a.fileName),
      viewHref: assetViewHref(a.fileUrl, a.fileName),
      mimeType: a.mimeType, size: a.size, releaseId: a.releaseId, artistId: a.artistId, notes: a.notes,
      createdAt: a.createdAt.toISOString(), uploader: a.uploadedById ? uploaderName.get(a.uploadedById) ?? null : null,
      source: "upload", readOnly: false, parentHref: null, parentLabel: null,
    }));

    // Everything the label already has, read live from the catalog — release
    // covers, track audio/stems/art, artist photos, press images. Read-only here
    // (managed on the parent record); deduped against DAM uploads by URL.
    const seen = new Set(damAssets.map((a) => a.fileUrl));
    const derived: Asset[] = [];
    const add = (d: DerivedInput) => {
      // Skip missing OR null-like values ("null"/"undefined"/blank persisted as a
      // string): a release with no cover must not surface a downloadable artwork
      // row whose link resolves to "null.html".
      if (!isUsableFileUrl(d.url) || seen.has(d.url)) return;
      seen.add(d.url);
      const fileName = fileNameFromUrl(d.url);
      derived.push({
        id: d.id, category: d.category, title: d.title, fileName, fileUrl: d.url,
        downloadHref: downloadHrefFor(d.url, fileName),
        viewHref: assetViewHref(d.url, fileName),
        mimeType: guessMimeFromUrl(d.url), size: 0, releaseId: d.releaseId ?? null, artistId: d.artistId ?? null,
        notes: null, createdAt: d.createdAt, uploader: null, source: d.source, readOnly: true,
        parentHref: d.parentHref, parentLabel: d.parentLabel,
      });
    };

    for (const r of rels) {
      const createdAt = r.createdAt.toISOString();
      const parentHref = `/admin/releases/${r.id}/edit`;
      add({ id: `rel-cover-${r.id}`, category: "artwork", title: `${r.name} — cover`, url: r.coverImage, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
      for (const t of r.tracks) {
        add({ id: `trk-aud-${t.id}`, category: "master", title: `${t.name} — master`, url: t.audioFile, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
        add({ id: `trk-stm-${t.id}`, category: "stems", title: `${t.name} — stems`, url: t.stemsFile, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
        add({ id: `trk-img-${t.id}`, category: "artwork", title: `${t.name} — art`, url: t.image, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
      }
    }
    for (const a of arts) {
      add({ id: `art-photo-${a.id}`, category: "press_photo", title: `${a.name} — photo`, url: a.profilePicture, source: "artist", parentHref: `/admin/artists/${a.id}/edit`, parentLabel: a.name, createdAt: a.createdAt.toISOString(), artistId: a.id });
    }
    for (const p of press) {
      add({ id: `press-${p.id}`, category: "press_photo", title: p.title || "Press image", url: p.image, source: "press", parentHref: `/admin/press/${p.id}/edit`, parentLabel: p.title || "Press", createdAt: p.createdAt.toISOString() });
    }

    assets = [...damAssets, ...derived];
    releases = rels.map((r) => ({ id: r.id, name: r.name }));
    artists = arts.map((a) => ({ id: a.id, name: a.name }));

    releaseLyrics = {};
    releaseArtistId = {};
    releaseArtistIds = {};
    for (const r of rels) {
      const txt = r.tracks.some((t) => (t.lyrics ?? "").trim() !== "");
      const lrc = r.tracks.some((t) => (t.syncedLyrics ?? "").trim() !== "");
      if (txt || lrc) releaseLyrics[r.id] = { txt, lrc };
      const firstArtist = r.primaryArtistIds[0];
      if (firstArtist) releaseArtistId[r.id] = firstArtist;
      if (r.primaryArtistIds.length) releaseArtistIds[r.id] = r.primaryArtistIds;
    }
  } catch {
    // Empty library on a transient DB error.
  }
  return (
    <AssetsClient
      initial={assets}
      releases={releases}
      artists={artists}
      releaseLyrics={releaseLyrics}
      releaseArtistId={releaseArtistId}
      releaseArtistIds={releaseArtistIds}
    />
  );
}
