import { NextRequest, NextResponse } from "next/server";
import type { Track } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
  serializeTrackForPublic,
} from "@/lib/release-format";
import { publicReleaseWhere } from "@/lib/catalog-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/songs/latest — one playable track per release, in catalog `sortOrder` (home carousel)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Clamp: NaN/huge values must not turn this into a full-catalog dump.
    const parsedLimit = parseInt(searchParams.get("limit") || "8", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 50)
      : 8;

    // Public endpoint: only released (or now-due scheduled) releases — never
    // DRAFT / future-dated, so unreleased audio doesn't leak. (See catalog-data.)
    const releases = await prisma.release.findMany({
      where: {
        ...publicReleaseWhere(),
        // Only releases that actually have a playable track, so we can bound the
        // query to `limit` rows instead of loading the whole catalog to find them.
        tracks: { some: { audioFile: { not: null } } },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        // Just the first playable track per release — not every track's full row
        // (the lyrics/syncedLyrics/stems/credits JSON we'd immediately discard).
        tracks: {
          where: { audioFile: { not: null } },
          orderBy: { sortOrder: "asc" },
          take: 1,
        },
      },
    });

    const trackReleasePairs: {
      track: Track;
      showLatestOnHome: boolean;
    }[] = [];

    for (const r of releases) {
      const track = r.tracks[0];
      if (!track || !track.audioFile || String(track.audioFile).trim() === "") continue;
      trackReleasePairs.push({
        track,
        showLatestOnHome: r.showLatestOnHome,
      });
    }

    const allArtistIds = new Set<string>();
    trackReleasePairs.forEach(({ track: t }) => {
      t.primaryArtistIds.forEach((id) => allArtistIds.add(String(id)));
      t.featureArtistIds.forEach((id) => allArtistIds.add(String(id)));
    });

    const artists = await prisma.artist.findMany({
      where: { id: { in: Array.from(allArtistIds) } },
      select: {
        id: true,
        name: true,
        profilePicture: true,
      },
    });

    const artistMap = buildArtistMap(artists);

    const rows = trackReleasePairs.map(({ track, showLatestOnHome }) => {
      const primaryIds = track.primaryArtistIds || [];
      const primaryArtistId = primaryIds[0];
      const primaryArtist = primaryArtistId
        ? artistMap.get(String(primaryArtistId))
        : null;
      const primaryArtistName =
        primaryIds
          .map((id) => artistMap.get(String(id))?.name)
          .filter((name): name is string => Boolean(name))
          .join(", ") || "Unknown Artist";
      const featureArtistNames = combinedFeatureDisplayNames(
        track.featureArtistIds || [],
        primaryIds,
        artistMap,
        track.featureArtistNames
      );

      return {
        ...serializeTrackForPublic(track),
        artist: primaryArtist || null,
        primaryArtistName,
        featureArtistNames,
        showLatestOnHome,
      };
    });

    return NextResponse.json(rows, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching latest songs:", error);
    return NextResponse.json(
      { error: "Failed to fetch latest songs" },
      { status: 500 }
    );
  }
}
