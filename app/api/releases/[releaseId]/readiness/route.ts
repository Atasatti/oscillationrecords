import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { computeReleaseReadiness } from "@/lib/release-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/readiness — delivery-readiness checklist computed
// from the release's existing fields (no extra state). Catalog-gated.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      select: {
        coverImage: true,
        upcCode: true,
        primaryGenre: true,
        releaseDate: true,
        primaryArtistIds: true,
        spotifyLink: true,
        appleMusicLink: true,
        tidalLink: true,
        amazonMusicLink: true,
        youtubeLink: true,
        soundcloudLink: true,
        tracks: { select: { isrcCode: true } },
      },
    });
    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const linkCount = [
      release.spotifyLink, release.appleMusicLink, release.tidalLink,
      release.amazonMusicLink, release.youtubeLink, release.soundcloudLink,
    ].filter(Boolean).length;

    const readiness = computeReleaseReadiness({
      hasCover: !!release.coverImage,
      trackCount: release.tracks.length,
      tracksMissingIsrc: release.tracks.filter((t) => !t.isrcCode?.trim()).length,
      hasUpc: !!release.upcCode?.trim(),
      hasReleaseDate: !!release.releaseDate,
      hasPrimaryArtist: release.primaryArtistIds.length > 0,
      hasGenre: !!release.primaryGenre?.trim(),
      linkCount,
    });

    return NextResponse.json(readiness, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release readiness GET error:", e);
    return NextResponse.json({ error: "Failed to compute readiness" }, { status: 500 });
  }
}
