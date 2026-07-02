import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { computeReleaseReadiness, type ReleaseReadinessResult } from "@/lib/release-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PipelineItem = {
  id: string;
  name: string;
  status: "DRAFT" | "SCHEDULED";
  releaseDate: string | null;
  coverImage: string;
  artistNames: string[];
  readiness: ReleaseReadinessResult;
};

// GET /api/releases/pipeline — the release pipeline: DRAFT + SCHEDULED releases,
// each with its delivery-readiness computed. Scheduled sorted soonest-first,
// drafts most-recently-updated first. Catalog-gated.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const releases = await prisma.release.findMany({
      where: { status: { in: ["DRAFT", "SCHEDULED"] } },
      select: {
        id: true,
        name: true,
        status: true,
        coverImage: true,
        upcCode: true,
        primaryGenre: true,
        releaseDate: true,
        primaryArtistIds: true,
        updatedAt: true,
        spotifyLink: true,
        appleMusicLink: true,
        tidalLink: true,
        amazonMusicLink: true,
        youtubeLink: true,
        soundcloudLink: true,
        tracks: { select: { isrcCode: true } },
      },
    });

    // Resolve primary-artist names in one query.
    const artistIds = [...new Set(releases.flatMap((r) => r.primaryArtistIds))];
    const artists = artistIds.length
      ? await prisma.artist.findMany({ where: { id: { in: artistIds } }, select: { id: true, name: true } })
      : [];
    const artistName = new Map(artists.map((a) => [a.id, a.name]));

    type Built = PipelineItem & { updatedAt: Date };
    const built: Built[] = releases.map((r) => {
      const linkCount = [
        r.spotifyLink, r.appleMusicLink, r.tidalLink,
        r.amazonMusicLink, r.youtubeLink, r.soundcloudLink,
      ].filter(Boolean).length;
      return {
        id: r.id,
        name: r.name,
        status: r.status as "DRAFT" | "SCHEDULED",
        releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
        coverImage: r.coverImage,
        artistNames: r.primaryArtistIds
          .map((id) => artistName.get(id))
          .filter((n): n is string => Boolean(n)),
        readiness: computeReleaseReadiness({
          hasCover: !!r.coverImage,
          trackCount: r.tracks.length,
          tracksMissingIsrc: r.tracks.filter((t) => !t.isrcCode?.trim()).length,
          hasUpc: !!r.upcCode?.trim(),
          hasReleaseDate: !!r.releaseDate,
          hasPrimaryArtist: r.primaryArtistIds.length > 0,
          hasGenre: !!r.primaryGenre?.trim(),
          linkCount,
        }),
        updatedAt: r.updatedAt,
      };
    });

    const strip = ({ updatedAt, ...rest }: Built): PipelineItem => { void updatedAt; return rest; };
    const dateMs = (iso: string | null) => (iso ? new Date(iso).getTime() : Infinity);

    // Scheduled: soonest release date first. Drafts: most recently touched first.
    const scheduled = built
      .filter((r) => r.status === "SCHEDULED")
      .sort((a, b) => dateMs(a.releaseDate) - dateMs(b.releaseDate))
      .map(strip);
    const drafts = built
      .filter((r) => r.status === "DRAFT")
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(strip);

    return NextResponse.json({ scheduled, drafts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release pipeline GET error:", e);
    return NextResponse.json({ error: "Failed to load pipeline" }, { status: 500 });
  }
}
