import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { slugify } from "@/lib/slug";
import { buildLyricsTxt, buildLrcEntries } from "@/lib/lyrics-export";
import { storeZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/lyrics?format=txt|lrc — synthesize a downloadable
// lyrics file from the release's tracks. Admin-only (lyrics/synced timing are
// internal). 404 when the requested format has nothing to export.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;

  try {
    const { releaseId } = await params;
    const format = new URL(request.url).searchParams.get("format") === "lrc" ? "lrc" : "txt";

    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: {
        name: true,
        tracks: {
          orderBy: { sortOrder: "asc" },
          select: { name: true, lyrics: true, syncedLyrics: true },
        },
      },
    });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const base = slugify(release.name) || "release";

    if (format === "txt") {
      const txt = buildLyricsTxt(release.tracks);
      if (!txt) return NextResponse.json({ error: "No lyrics" }, { status: 404 });
      return new NextResponse(txt, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}-lyrics.txt"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const entries = buildLrcEntries(release.tracks);
    if (entries.length === 0) return NextResponse.json({ error: "No synced lyrics" }, { status: 404 });

    const [only] = entries;
    if (entries.length === 1 && only) {
      return new NextResponse(only.data, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${only.name}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const zip = storeZip(entries);
    return new NextResponse(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${base}-lrc.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error building release lyrics:", error);
    return NextResponse.json({ error: "Failed to build lyrics" }, { status: 500 });
  }
}
