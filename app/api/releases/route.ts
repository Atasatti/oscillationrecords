import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fuzzyScore } from "@/lib/fuzzy";
import { isAdminRequest, requireAdmin } from "@/lib/auth-guard";
import {
  apiKindToPrisma,
  buildArtistMap,
  combinedFeatureDisplayNames,
  featureIdsExcludingPrimary,
  formatArtistLine,
  getOptionalDate,
  normalizeFeatureArtistNamesInput,
  primaryNamesFromIds,
  prismaKindToApi,
} from "@/lib/release-format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases — list releases for public grid (optional `?limit=`; `?carousel=1` returns all `showOnHome` releases with no cap, or all releases if none flagged)
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await isAdminRequest(request);

    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get("limit");
    let take: number | undefined;
    if (limitRaw !== null && limitRaw !== "") {
      const n = parseInt(limitRaw, 10);
      if (Number.isFinite(n) && n > 0) {
        take = Math.min(n, 100);
      }
    }

    const carouselOnly = searchParams.get("carousel") === "1";
    const qParam = (searchParams.get("q") || "").trim();

    const baseList = {
      orderBy: [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }],
      include: {
        // Listing/search/carousel only need the first track's audio (for the card
        // player) and a track count — not every track's audio/lyrics/credits.
        // This keeps the payload small even as the catalog grows.
        tracks: {
          orderBy: { sortOrder: "asc" as const },
          take: 1,
          select: { audioFile: true },
        },
        _count: { select: { tracks: true } },
      },
    };

    let releases;
    if (carouselOnly) {
      const featured = await prisma.release.findMany({
        where: { showOnHome: true },
        ...baseList,
      });
      releases =
        featured.length > 0
          ? featured
          : await prisma.release.findMany(baseList);
    } else if (qParam.length > 0) {
      // Fuzzy match in JS (catalog is small) so "bigheck" still finds
      // releases by "Big Heck" — against release name, linked artists, and
      // manually entered feature names.
      const allArtists = await prisma.artist.findMany({
        select: { id: true, name: true },
      });
      const matchedArtistIds = new Set(
        allArtists
          .filter((a) => fuzzyScore(qParam, a.name) > 0)
          .map((a) => a.id)
      );

      const all = await prisma.release.findMany(baseList);
      releases = all
        .map((r) => {
          const artistHit =
            r.primaryArtistIds.some((id) => matchedArtistIds.has(String(id))) ||
            r.featureArtistIds.some((id) => matchedArtistIds.has(String(id)));
          const score = Math.max(
            fuzzyScore(qParam, r.name),
            ...(r.featureArtistNames || []).map((n) => fuzzyScore(qParam, n)),
            artistHit ? 75 : 0
          );
          return { r, score };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score)
        .map((x) => x.r);
      if (take !== undefined) releases = releases.slice(0, take);
    } else {
      releases = await prisma.release.findMany({
        ...(take !== undefined ? { take } : {}),
        ...baseList,
      });
    }

    const allArtistIds = new Set<string>();
    releases.forEach((r) => {
      r.primaryArtistIds.forEach((id) => allArtistIds.add(String(id)));
      r.featureArtistIds.forEach((id) => allArtistIds.add(String(id)));
    });

    const artists = await prisma.artist.findMany({
      where: { id: { in: Array.from(allArtistIds) } },
      select: { id: true, name: true },
    });
    const artistMap = buildArtistMap(artists);

    const out = releases.map((r) => {
      const primaryIds = r.primaryArtistIds || [];
      const primaryArtistId = primaryIds[0];
      const rawFeatureIds = r.featureArtistIds || [];
      const featureArtistIds = featureIdsExcludingPrimary(rawFeatureIds, primaryIds);
      const featureArtistNames = combinedFeatureDisplayNames(
        rawFeatureIds,
        primaryIds,
        artistMap,
        r.featureArtistNames
      );
      const primaryName = primaryNamesFromIds(primaryIds, artistMap);
      const rd = getOptionalDate(r.releaseDate);

      const firstAudio = r.tracks[0]?.audioFile ?? null;

      return {
        id: r.id,
        name: r.name,
        thumbnail: r.coverImage,
        audio: firstAudio,
        type: prismaKindToApi(r.kind),
        primaryArtistName: primaryName,
        artist: formatArtistLine(primaryName, featureArtistNames),
        artistId: primaryArtistId ? String(primaryArtistId) : "",
        featureArtistIds,
        featureArtistNames,
        releaseDate: r.releaseDate,
        upcCode: isAdmin ? r.upcCode : null,
        spotifyLink: r.spotifyLink || null,
        appleMusicLink: r.appleMusicLink || null,
        tidalLink: r.tidalLink || null,
        amazonMusicLink: r.amazonMusicLink || null,
        youtubeLink: r.youtubeLink || null,
        soundcloudLink: r.soundcloudLink || null,
        isrcExplicit: r.isrcExplicit,
        sortOrder: r.sortOrder,
        showLatestOnHome: r.showLatestOnHome,
        showOnHome: r.showOnHome,
        createdAt: r.createdAt,
        year: rd
          ? rd.getFullYear().toString()
          : new Date(r.createdAt).getFullYear().toString(),
        songCount: r._count.tracks,
      };
    });

    // Cache the public response at the CDN (results vary by query string, which
    // is part of the cache key). Admin responses include private fields, so they
    // are never shared-cached.
    return NextResponse.json(out, {
      headers: {
        "Cache-Control": isAdmin
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}

// POST /api/releases — create release shell (tracks added separately)
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const kind = apiKindToPrisma(body.kind);
    if (!kind) {
      return NextResponse.json(
        { error: "kind must be single, ep, or album" },
        { status: 400 }
      );
    }

    const {
      name,
      coverImage,
      releaseDate,
      description,
      primaryGenre,
      secondaryGenre,
      spotifyLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      youtubeLink,
      soundcloudLink,
      isrcExplicit,
      upcCode,
      primaryArtistIds,
      featureArtistIds,
      featureArtistNames: featureArtistNamesRaw,
    } = body;

    if (!name || !coverImage) {
      return NextResponse.json(
        { error: "name and coverImage are required" },
        { status: 400 }
      );
    }

    if (
      !primaryArtistIds ||
      !Array.isArray(primaryArtistIds) ||
      primaryArtistIds.length === 0
    ) {
      return NextResponse.json(
        { error: "At least one primary artist is required" },
        { status: 400 }
      );
    }

    const primaryArtists = await prisma.artist.findMany({
      where: { id: { in: primaryArtistIds } },
    });
    if (primaryArtists.length !== primaryArtistIds.length) {
      return NextResponse.json(
        { error: "One or more primary artists not found" },
        { status: 404 }
      );
    }

    const featIds = featureArtistIds || [];
    const featManual = normalizeFeatureArtistNamesInput(featureArtistNamesRaw);
    if (featIds.length > 0) {
      const featureArtists = await prisma.artist.findMany({
        where: { id: { in: featIds } },
      });
      if (featureArtists.length !== featIds.length) {
        return NextResponse.json(
          { error: "One or more feature artists not found" },
          { status: 404 }
        );
      }
    }

    const minOrder = await prisma.release.aggregate({
      _min: { sortOrder: true },
    });
    const sortOrder = (minOrder._min.sortOrder ?? 0) - 1;

    const release = await prisma.release.create({
      data: {
        kind,
        name: String(name),
        coverImage: String(coverImage),
        primaryArtistIds,
        featureArtistIds: featIds,
        featureArtistNames: featManual,
        sortOrder,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        description: description ? String(description) : null,
        primaryGenre: primaryGenre ? String(primaryGenre) : null,
        secondaryGenre: secondaryGenre ? String(secondaryGenre) : null,
        spotifyLink: spotifyLink || null,
        appleMusicLink: appleMusicLink || null,
        tidalLink: tidalLink || null,
        amazonMusicLink: amazonMusicLink || null,
        youtubeLink: youtubeLink || null,
        soundcloudLink: soundcloudLink || null,
        isrcExplicit: Boolean(isrcExplicit),
        upcCode:
          upcCode != null && String(upcCode).trim() !== ""
            ? String(upcCode).trim()
            : null,
      },
      include: { tracks: { orderBy: { sortOrder: "asc" } } },
    });

    const allArtistIds = [
      ...release.primaryArtistIds,
      ...release.featureArtistIds,
    ];
    const artists = await prisma.artist.findMany({
      where: { id: { in: allArtistIds } },
      select: { id: true, name: true, profilePicture: true },
    });

    return NextResponse.json(
      {
        ...release,
        type: prismaKindToApi(release.kind),
        songs: release.tracks,
        tracks: release.tracks,
        artists,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating release:", error);
    return NextResponse.json(
      { error: "Failed to create release" },
      { status: 500 }
    );
  }
}
