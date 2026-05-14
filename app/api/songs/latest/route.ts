import { NextRequest, NextResponse } from "next/server";
import type { Track } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
  serializeTrackForPublic,
} from "@/lib/release-format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/songs/latest — one playable track per release, in catalog `sortOrder` (home carousel)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "8", 10);

    const releases = await prisma.release.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        tracks: { orderBy: { sortOrder: "asc" } },
      },
    });

    const trackReleasePairs: {
      track: Track;
      showLatestOnHome: boolean;
    }[] = [];

    for (const r of releases) {
      const track = r.tracks.find(
        (t) => t.audioFile && String(t.audioFile).trim() !== ""
      );
      if (!track) continue;
      trackReleasePairs.push({
        track,
        showLatestOnHome: r.showLatestOnHome,
      });
      if (trackReleasePairs.length >= limit) break;
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

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error fetching latest songs:", error);
    return NextResponse.json(
      { error: "Failed to fetch latest songs" },
      { status: 500 }
    );
  }
}
