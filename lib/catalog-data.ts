import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
  featureIdsExcludingPrimary,
  formatArtistLine,
  getOptionalDate,
  primaryNamesFromIds,
  prismaKindToApi,
} from "@/lib/release-format";

/**
 * Server-side data helpers for the public catalog. These are the single source
 * of truth for shaping releases/artists for the public site: both the API
 * routes (for client fetches) and the Server Components (for the initial HTML)
 * call them, so the two can't drift. All getters degrade to empty results if
 * the DB is unavailable rather than throwing the whole page.
 */

export interface ReleaseCardDTO {
  id: string;
  name: string;
  thumbnail: string | null;
  audio: string | null;
  type: "single" | "ep" | "album";
  primaryArtistName: string;
  artist: string;
  artistId: string;
  featureArtistIds: string[];
  featureArtistNames: string[];
  upcCode: string | null;
  spotifyLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  youtubeLink: string | null;
  soundcloudLink: string | null;
  isrcExplicit: boolean;
  sortOrder: number;
  showLatestOnHome: boolean;
  showOnHome: boolean;
  homeOrder: number;
  status: "DRAFT" | "SCHEDULED" | "RELEASED";
  preSaveUrl: string | null;
  // ISO strings (matches the API's JSON shape; safe to pass to client components).
  releaseDate: string | null;
  createdAt: string;
  year: string;
  songCount: number;
}

// Listing/search/carousel only need the first track's audio (for the card
// player) and a track count — not every track's audio/lyrics/credits. This
// keeps the payload small even as the catalog grows.
// ---------------------------------------------------------------------------
// Release visibility gating (shared by EVERY public reader — a missed filter
// leaks unreleased music). No cron exists, so publishing is query-time: a
// SCHEDULED release auto-goes-public once its releaseDate passes.
// ---------------------------------------------------------------------------

/** Releases the public may see: RELEASED, or SCHEDULED whose date has arrived. */
export function publicReleaseWhere(): Prisma.ReleaseWhereInput {
  return {
    OR: [
      { status: "RELEASED" },
      { status: "SCHEDULED", releaseDate: { lte: new Date() } },
    ],
  };
}

/** Future-dated SCHEDULED releases — the "Coming Soon" source. */
export function scheduledReleaseWhere(): Prisma.ReleaseWhereInput {
  return { status: "SCHEDULED", releaseDate: { gt: new Date() } };
}

export const releaseCardListArgs = {
  orderBy: [{ sortOrder: "asc" as const }, { createdAt: "desc" as const }],
  include: {
    tracks: {
      orderBy: { sortOrder: "asc" as const },
      take: 1,
      select: { audioFile: true },
    },
    _count: { select: { tracks: true } },
  },
};

type ReleaseWithCardData = Awaited<
  ReturnType<typeof prisma.release.findMany<typeof releaseCardListArgs>>
>[number];

/**
 * Turn raw release rows (loaded with {@link releaseCardListArgs}) into card
 * DTOs, resolving artist display names. `isAdmin` controls whether the private
 * `upcCode` is exposed.
 */
export async function mapReleasesToCards(
  releases: ReleaseWithCardData[],
  { isAdmin }: { isAdmin: boolean }
): Promise<ReleaseCardDTO[]> {
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

  return releases.map((r) => {
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
      homeOrder: r.homeOrder,
      status: r.status,
      preSaveUrl: r.preSaveUrl ?? null,
      releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      year: rd
        ? rd.getFullYear().toString()
        : new Date(r.createdAt).getFullYear().toString(),
      songCount: r._count.tracks,
    };
  });
}

/**
 * Releases for the "New Music" carousel. Releases flagged for the home carousel
 * (`showOnHome`) come first in their admin order, then the rest auto-fill newest
 * first, so new releases surface without being flagged. Capped at 12.
 */
export async function getCarouselReleases(): Promise<ReleaseCardDTO[]> {
  try {
    const all = await prisma.release.findMany({
      ...releaseCardListArgs,
      where: publicReleaseWhere(),
    });
    // Featured releases first, in their curated home order; then the rest fill in
    // newest-first up to the cap.
    const pinned = all
      .filter((r) => r.showOnHome)
      .sort((a, b) => a.homeOrder - b.homeOrder);
    const rest = all
      .filter((r) => !r.showOnHome)
      .sort((a, b) => {
        const ta = (a.releaseDate ? new Date(a.releaseDate) : new Date(a.createdAt)).getTime();
        const tb = (b.releaseDate ? new Date(b.releaseDate) : new Date(b.createdAt)).getTime();
        return tb - ta;
      });
    const releases = [...pinned, ...rest].slice(0, 12);
    return await mapReleasesToCards(releases, { isAdmin: false });
  } catch (e) {
    console.error("getCarouselReleases: DB unavailable", e);
    return [];
  }
}

/** All releases for the public "All releases" grid, newest/admin order. */
export async function getPublicReleases(): Promise<ReleaseCardDTO[]> {
  try {
    const releases = await prisma.release.findMany({
      ...releaseCardListArgs,
      where: publicReleaseWhere(),
    });
    return await mapReleasesToCards(releases, { isAdmin: false });
  } catch (e) {
    console.error("getPublicReleases: DB unavailable", e);
    return [];
  }
}

export interface ArtistDetailDTO {
  id: string;
  name: string;
  biography: string;
  profilePicture: string | null;
  genres: string[];
  isni: string | null;
  musicBrainzId: string | null;
  xLink: string | null;
  tiktokLink: string | null;
  spotifyLink: string | null;
  instagramLink: string | null;
  youtubeLink: string | null;
  facebookLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  soundcloudLink: string | null;
}

/**
 * A single artist plus their releases (as cards), for the artist detail page.
 * Release display names are resolved here, so the page doesn't need the whole
 * roster to label features. Returns null if the artist doesn't exist; throws
 * are swallowed to an empty-releases result so the page can still render.
 */
export const getArtistDetail = cache(async (
  artistId: string
): Promise<{ artist: ArtistDetailDTO; releases: ReleaseCardDTO[] } | null> => {
  try {
    const [artist, releaseRows] = await Promise.all([
      prisma.artist.findUnique({ where: { id: artistId } }),
      prisma.release.findMany({
        ...releaseCardListArgs,
        where: {
          AND: [
            {
              OR: [
                { primaryArtistIds: { has: artistId } },
                { featureArtistIds: { has: artistId } },
              ],
            },
            publicReleaseWhere(),
          ],
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!artist) return null;

    const releases = await mapReleasesToCards(releaseRows, { isAdmin: false });
    return {
      artist: {
        id: artist.id,
        name: artist.name,
        biography: artist.biography,
        profilePicture: artist.profilePicture ?? null,
        genres: artist.genres ?? [],
        isni: artist.isni ?? null,
        musicBrainzId: artist.musicBrainzId ?? null,
        xLink: artist.xLink ?? null,
        tiktokLink: artist.tiktokLink ?? null,
        spotifyLink: artist.spotifyLink ?? null,
        instagramLink: artist.instagramLink ?? null,
        youtubeLink: artist.youtubeLink ?? null,
        facebookLink: artist.facebookLink ?? null,
        appleMusicLink: artist.appleMusicLink ?? null,
        tidalLink: artist.tidalLink ?? null,
        amazonMusicLink: artist.amazonMusicLink ?? null,
        soundcloudLink: artist.soundcloudLink ?? null,
      },
      releases,
    };
  } catch (e) {
    console.error("getArtistDetail: DB unavailable", e);
    return null;
  }
});

export interface PublicArtistDTO {
  id: string;
  name: string;
  biography: string;
  profilePicture: string | null;
  xLink: string | null;
  tiktokLink: string | null;
  spotifyLink: string | null;
  instagramLink: string | null;
  youtubeLink: string | null;
  facebookLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  soundcloudLink: string | null;
  // ISO strings (matches the API's JSON shape; safe to pass to client components).
  createdAt: string;
  updatedAt: string;
}

type ArtistRecord = {
  id: string;
  name: string;
  biography: string;
  profilePicture: string | null;
  xLink: string | null;
  tiktokLink: string | null;
  spotifyLink: string | null;
  instagramLink: string | null;
  youtubeLink: string | null;
  facebookLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  soundcloudLink: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicArtist(a: ArtistRecord): PublicArtistDTO {
  return {
    id: a.id,
    name: a.name,
    biography: a.biography,
    profilePicture: a.profilePicture ?? null,
    xLink: a.xLink ?? null,
    tiktokLink: a.tiktokLink ?? null,
    spotifyLink: a.spotifyLink ?? null,
    instagramLink: a.instagramLink ?? null,
    youtubeLink: a.youtubeLink ?? null,
    facebookLink: a.facebookLink ?? null,
    appleMusicLink: a.appleMusicLink ?? null,
    tidalLink: a.tidalLink ?? null,
    amazonMusicLink: a.amazonMusicLink ?? null,
    soundcloudLink: a.soundcloudLink ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/** All live artists for the public /artists page, listed alphabetically. */
export async function getPublicArtists(): Promise<PublicArtistDTO[]> {
  try {
    const artists = await prisma.artist.findMany({
      where: { showOnWebsite: true },
      orderBy: [{ name: "asc" }],
    });
    return artists.map(toPublicArtist);
  } catch (e) {
    console.error("getPublicArtists: DB unavailable", e);
    return [];
  }
}

export interface ReleaseMetaDTO {
  id: string;
  name: string;
  coverImage: string | null;
  description: string | null;
  releaseDate: string | null; // ISO
  genres: string[];
  primaryArtist: { id: string; name: string } | null;
  spotifyLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  youtubeLink: string | null;
  soundcloudLink: string | null;
  tracks: { name: string }[];
}

/** Minimal public release data for SEO metadata + JSON-LD. Returns null if missing. */
export const getReleaseMeta = cache(async (id: string): Promise<ReleaseMetaDTO | null> => {
  try {
    // SCHEDULED is allowed (the public Coming-Soon detail page + its SEO use this);
    // DRAFT returns null so it stays unlisted.
    const r = await prisma.release.findFirst({
      where: { id, status: { not: "DRAFT" } },
      select: {
        id: true,
        name: true,
        coverImage: true,
        description: true,
        releaseDate: true,
        primaryGenre: true,
        secondaryGenre: true,
        primaryArtistIds: true,
        spotifyLink: true,
        appleMusicLink: true,
        tidalLink: true,
        amazonMusicLink: true,
        youtubeLink: true,
        soundcloudLink: true,
        tracks: { select: { name: true }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!r) return null;

    let primaryArtist: { id: string; name: string } | null = null;
    const firstId = r.primaryArtistIds?.[0];
    if (firstId) {
      const a = await prisma.artist.findUnique({
        where: { id: firstId },
        select: { id: true, name: true },
      });
      if (a) primaryArtist = a;
    }

    return {
      id: r.id,
      name: r.name,
      coverImage: r.coverImage ?? null,
      description: r.description ?? null,
      releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
      genres: [r.primaryGenre, r.secondaryGenre].filter((g): g is string => Boolean(g)),
      primaryArtist,
      spotifyLink: r.spotifyLink ?? null,
      appleMusicLink: r.appleMusicLink ?? null,
      tidalLink: r.tidalLink ?? null,
      amazonMusicLink: r.amazonMusicLink ?? null,
      youtubeLink: r.youtubeLink ?? null,
      soundcloudLink: r.soundcloudLink ?? null,
      tracks: r.tracks.map((t) => ({ name: t.name })),
    };
  } catch (e) {
    console.error("getReleaseMeta: DB unavailable", e);
    return null;
  }
});

/**
 * Curated artists for the home "Meet the Artists" carousel: those flagged
 * `featuredOnHome`, in `homeOrder`. Falls back to all live artists (alphabetical)
 * when nothing is featured yet, so the home page is never empty.
 */
export async function getHomeArtists(): Promise<PublicArtistDTO[]> {
  try {
    const featured = await prisma.artist.findMany({
      where: { featuredOnHome: true, showOnWebsite: true },
      orderBy: [{ homeOrder: "asc" }, { name: "asc" }],
    });
    if (featured.length > 0) return featured.map(toPublicArtist);
    return getPublicArtists();
  } catch (e) {
    console.error("getHomeArtists: DB unavailable", e);
    return [];
  }
}

export interface UpcomingReleaseDTO {
  id: string;
  name: string;
  type: "single" | "ep" | "album";
  image: string;
  releaseDate: string; // ISO string (matches the API's JSON shape).
  preSmartLinkUrl: string | null;
  /** Legacy free-text (kept for older rows / fallback). */
  primaryArtist: string | null;
  featureArtist: string | null;
  /** Resolved display names (linked catalogue artists, falling back to legacy text). */
  primaryArtistName: string | null;
  featureLine: string | null;
}

/** Today's and future scheduled releases, in admin order. */
export async function getUpcomingReleases(): Promise<UpcomingReleaseDTO[]> {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const releases = await prisma.upcomingRelease.findMany({
      where: { releaseDate: { gte: startOfToday } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    // Resolve linked artist ids → names in one query.
    const ids = [
      ...new Set(
        releases.flatMap((r) => [...r.primaryArtistIds, ...r.featureArtistIds])
      ),
    ];
    const artists = ids.length
      ? await prisma.artist.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(artists.map((a) => [a.id, a.name]));

    return releases.map((r) => {
      const primaryNames = r.primaryArtistIds
        .map((id) => nameById.get(id))
        .filter((n): n is string => Boolean(n));
      const featureNames = [
        ...r.featureArtistIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n)),
        ...(r.featureArtistNames ?? []),
      ];
      return {
        id: r.id,
        name: r.name,
        type: r.type as UpcomingReleaseDTO["type"],
        image: r.image,
        releaseDate: r.releaseDate.toISOString(),
        preSmartLinkUrl: r.preSmartLinkUrl ?? null,
        primaryArtist: r.primaryArtist ?? null,
        featureArtist: r.featureArtist ?? null,
        primaryArtistName: primaryNames.join(", ") || r.primaryArtist || null,
        featureLine: featureNames.join(", ") || r.featureArtist || null,
      };
    });
  } catch (e) {
    console.error("getUpcomingReleases: DB unavailable", e);
    return [];
  }
}
