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
  serializeTrackForPublic,
} from "@/lib/release-format";
import { computeReleaseSeo, type ReleaseSeoGrade } from "@/lib/seo-score";
import { compareComingSoon } from "@/lib/coming-soon-order";
import { slugify, OBJECT_ID_RE } from "@/lib/slug";

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
  comingSoonOrder: number | null;
  status: "DRAFT" | "SCHEDULED" | "RELEASED";
  preSaveUrl: string | null;
  // ISO strings (matches the API's JSON shape; safe to pass to client components).
  releaseDate: string | null;
  createdAt: string;
  year: string;
  songCount: number;
  // Per-release SEO score (0–100) + weight-ordered gaps, mirroring the artist
  // roster's score. Admin-only: null/empty for the public site. See
  // lib/seo-score.ts (computeReleaseSeo).
  seoScore: number | null;
  seoGrade: ReleaseSeoGrade | null;
  seoComplete: boolean;
  seoMissing: string[];
}

// Streaming-link fields scored as `sameAs` signals on a release.
const RELEASE_LINK_KEYS = [
  "spotifyLink",
  "appleMusicLink",
  "tidalLink",
  "amazonMusicLink",
  "youtubeLink",
  "soundcloudLink",
] as const;

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
    // A live release is only public once it has at least one track. A trackless
    // RELEASED release is still being set up (created directly as Released, with
    // the tracklist added next), so it stays hidden like a draft until then.
    tracks: { some: {} },
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

/**
 * In-memory mirror of {@link publicReleaseWhere} for a single already-loaded
 * release: true when the public may see it (RELEASED, or SCHEDULED whose date
 * has arrived). Used to gate detail endpoints that load a row before deciding
 * visibility.
 */
export function isReleasePublic(r: {
  status: "DRAFT" | "SCHEDULED" | "RELEASED";
  releaseDate: Date | null;
}): boolean {
  if (r.status === "RELEASED") return true;
  if (r.status === "SCHEDULED" && r.releaseDate && r.releaseDate.getTime() <= Date.now()) {
    return true;
  }
  return false;
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

    // SEO score is an admin-only metric; skip the work for public callers.
    const seo = isAdmin
      ? computeReleaseSeo({
          hasCover: Boolean(r.coverImage),
          descLength: (r.description ?? "").trim().length,
          genreCount: [r.primaryGenre, r.secondaryGenre].filter((g) => Boolean(g && g.trim()))
            .length,
          linkCount: RELEASE_LINK_KEYS.filter((k) => Boolean((r as Record<string, unknown>)[k]))
            .length,
          trackCount: r._count.tracks,
          hasReleaseDate: Boolean(r.releaseDate),
          hasPrimaryArtist: Boolean(primaryArtistId),
        })
      : null;

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
      comingSoonOrder: r.comingSoonOrder ?? null,
      status: r.status,
      preSaveUrl: r.preSaveUrl ?? null,
      releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      year: rd
        ? rd.getFullYear().toString()
        : new Date(r.createdAt).getFullYear().toString(),
      songCount: r._count.tracks,
      seoScore: seo?.score ?? null,
      seoGrade: seo?.grade ?? null,
      seoComplete: seo ? seo.missing.length === 0 : false,
      seoMissing: seo?.missing ?? [],
    };
  });
}

/**
 * Releases for the "New Music" carousel — exactly the releases the admin curated
 * (`showOnHome`), in the order they set (`homeOrder`). No auto-fill: the homepage
 * mirrors the admin's New Music selection 1:1. Only publicly-visible (live)
 * releases are returned, so a not-yet-released flagged release stays hidden until
 * its date arrives.
 */
export async function getCarouselReleases(): Promise<ReleaseCardDTO[]> {
  try {
    const featured = await prisma.release.findMany({
      ...releaseCardListArgs,
      where: { AND: [{ showOnHome: true }, publicReleaseWhere()] },
    });
    featured.sort((a, b) => a.homeOrder - b.homeOrder);
    return await mapReleasesToCards(featured, { isAdmin: false });
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
  wikidataId: string | null;
  wikipediaUrl: string | null;
  country: string | null;
  city: string | null;
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
  // Guard non-ObjectId ids (a slug or junk reaching here would otherwise throw a
  // "Malformed ObjectID" DB error and spam the log — return a clean not-found).
  if (!OBJECT_ID_RE.test(artistId)) return null;
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
        wikidataId: artist.wikidataId ?? null,
        wikipediaUrl: artist.wikipediaUrl ?? null,
        country: artist.country ?? null,
        city: artist.city ?? null,
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

/**
 * Every public artist's slug → id (slug derived from the name). Powers the
 * pretty `/artists/<slug>` URLs, the static params, and the sitemap. Cached per
 * request so resolving a slug never costs more than one query.
 */
export const getArtistSlugIndex = cache(
  async (): Promise<{ id: string; name: string; slug: string }[]> => {
    try {
      const artists = await prisma.artist.findMany({
        where: { showOnWebsite: true },
        select: { id: true, name: true },
      });
      return artists.map((a) => ({ id: a.id, name: a.name, slug: slugify(a.name) }));
    } catch (e) {
      console.error("getArtistSlugIndex: DB unavailable", e);
      return [];
    }
  }
);

/** Resolve a pretty `/artists/<slug>` to its artist id, or null if no match. */
export const resolveArtistIdBySlug = cache(
  async (slug: string): Promise<string | null> => {
    const index = await getArtistSlugIndex();
    return index.find((a) => a.slug === slug)?.id ?? null;
  }
);

/**
 * Every public (non-DRAFT) release's slug → id (slug derived from the title).
 * Powers pretty `/releases/<slug>` URLs, the static params, and the sitemap —
 * mirrors the artist slug index. Cached per request.
 */
export const getReleaseSlugIndex = cache(
  async (): Promise<{ id: string; name: string; slug: string }[]> => {
    try {
      const releases = await prisma.release.findMany({
        where: { status: { not: "DRAFT" } },
        select: { id: true, name: true },
      });
      return releases.map((r) => ({ id: r.id, name: r.name, slug: slugify(r.name) }));
    } catch (e) {
      console.error("getReleaseSlugIndex: DB unavailable", e);
      return [];
    }
  }
);

/** Resolve a pretty `/releases/<slug>` to its release id, or null if no match. */
export const resolveReleaseIdBySlug = cache(
  async (slug: string): Promise<string | null> => {
    const index = await getReleaseSlugIndex();
    return index.find((r) => r.slug === slug)?.id ?? null;
  }
);

/** All live artists for the public /artists page, listed alphabetically. */
export async function getPublicArtists(): Promise<PublicArtistDTO[]> {
  try {
    const artists = await prisma.artist.findMany({
      where: { showOnWebsite: true },
      // Honour the admin's custom order; fall back to name for unplaced ties.
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
  primaryArtists: { id: string; name: string }[];
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
  if (!OBJECT_ID_RE.test(id)) return null; // non-ObjectId → clean not-found, no DB throw
  try {
    // SCHEDULED is allowed (the public Coming-Soon detail page + its SEO use this);
    // DRAFT returns null so it stays unlisted.
    const r = await prisma.release.findFirst({
      where: { id, status: { not: "DRAFT" } },
      select: {
        id: true,
        status: true,
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

    // A trackless live release (created directly as Released, tracks added next)
    // 404s on its detail page — don't emit metadata for it either.
    if (isReleasePublic({ status: r.status, releaseDate: r.releaseDate }) && r.tracks.length === 0) {
      return null;
    }

    // All primary artists, in the saved order (a release can have several).
    let primaryArtists: { id: string; name: string }[] = [];
    const ids = r.primaryArtistIds ?? [];
    if (ids.length) {
      const found = await prisma.artist.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      const byId = new Map(found.map((a) => [a.id, a]));
      primaryArtists = ids
        .map((id) => byId.get(id))
        .filter((a): a is { id: string; name: string } => Boolean(a));
    }

    return {
      id: r.id,
      name: r.name,
      coverImage: r.coverImage ?? null,
      description: r.description ?? null,
      releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
      genres: [r.primaryGenre, r.secondaryGenre].filter((g): g is string => Boolean(g)),
      primaryArtists,
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

/** Public track shape served to the release page (no ISRC/ISWC/lyrics/stems). */
export type ReleaseDetailTrackDTO = ReturnType<typeof serializeTrackForPublic>;

export interface ReleaseDetailDTO {
  id: string;
  name: string;
  status: "DRAFT" | "SCHEDULED" | "RELEASED";
  preSaveUrl: string | null;
  coverImage: string;
  type: "single" | "ep" | "album";
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames: string[];
  description: string | null;
  releaseDate: string | null; // ISO
  primaryGenre: string | null;
  secondaryGenre: string | null;
  composer: string | null;
  lyricist: string | null;
  leadVocal: string | null;
  credits: { role: string; people: string[] }[] | null;
  isrcExplicit: boolean;
  spotifyLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  youtubeLink: string | null;
  soundcloudLink: string | null;
  artists: { id: string; name: string; profilePicture: string | null }[];
  tracks: ReleaseDetailTrackDTO[];
  songs: ReleaseDetailTrackDTO[];
}

/**
 * Full public release detail for the server-rendered release page (so the
 * tracklist/description/credits ship in the initial HTML, not a client fetch).
 * Mirrors GET /api/releases/[id] for non-admins: returns null for missing or
 * DRAFT releases, and hides track audio for future-dated SCHEDULED (Coming Soon)
 * releases — pre-release audio must never leak. Degrades to null on DB error.
 */
export const getReleaseDetail = cache(
  async (releaseId: string): Promise<ReleaseDetailDTO | null> => {
    if (!OBJECT_ID_RE.test(releaseId)) return null; // non-ObjectId → clean not-found
    try {
      const release = await prisma.release.findUnique({
        where: { id: releaseId },
        include: { tracks: { orderBy: { sortOrder: "asc" } } },
      });
      // DRAFT is admin-only; SCHEDULED + RELEASED are public.
      if (!release || release.status === "DRAFT") return null;

      // A live release (RELEASED, or a SCHEDULED whose date has arrived) is only
      // public once it has at least one track — a trackless live release is still
      // being set up (created directly as Released, tracks added next), so hide it
      // like a draft. Future-dated SCHEDULED (Coming Soon) may still be trackless.
      if (isReleasePublic(release) && release.tracks.length === 0) return null;

      // Future-dated SCHEDULED: public metadata, but tracks (audio) stay hidden
      // until the date arrives. The page shows "Tracklist to be revealed".
      const hideTracks = !isReleasePublic(release);

      const allArtistIds = [...release.primaryArtistIds, ...release.featureArtistIds];
      release.tracks.forEach((t) => {
        t.primaryArtistIds.forEach((id) => allArtistIds.push(id));
        t.featureArtistIds.forEach((id) => allArtistIds.push(id));
      });
      const artists = await prisma.artist.findMany({
        where: { id: { in: [...new Set(allArtistIds.map(String))] } },
        select: { id: true, name: true, profilePicture: true },
      });

      const tracks = hideTracks ? [] : release.tracks.map(serializeTrackForPublic);

      return {
        id: release.id,
        name: release.name,
        status: release.status,
        preSaveUrl: release.preSaveUrl ?? null,
        coverImage: release.coverImage ?? "",
        type: prismaKindToApi(release.kind),
        primaryArtistIds: release.primaryArtistIds.map(String),
        featureArtistIds: release.featureArtistIds.map(String),
        featureArtistNames: release.featureArtistNames ?? [],
        description: release.description ?? null,
        releaseDate: release.releaseDate ? release.releaseDate.toISOString() : null,
        primaryGenre: release.primaryGenre ?? null,
        secondaryGenre: release.secondaryGenre ?? null,
        composer: release.composer ?? null,
        lyricist: release.lyricist ?? null,
        leadVocal: release.leadVocal ?? null,
        credits: (Array.isArray(release.credits)
          ? release.credits
          : null) as unknown as ReleaseDetailDTO["credits"],
        isrcExplicit: release.isrcExplicit,
        spotifyLink: release.spotifyLink ?? null,
        appleMusicLink: release.appleMusicLink ?? null,
        tidalLink: release.tidalLink ?? null,
        amazonMusicLink: release.amazonMusicLink ?? null,
        youtubeLink: release.youtubeLink ?? null,
        soundcloudLink: release.soundcloudLink ?? null,
        artists,
        tracks,
        songs: tracks,
      };
    } catch (e) {
      console.error("getReleaseDetail: DB unavailable", e);
      return null;
    }
  }
);

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

    // "Upcoming" is now just SCHEDULED releases with a future date.
    const releases = await prisma.release.findMany({
      where: scheduledReleaseWhere(),
    });
    // Order by the dedicated comingSoonOrder (set by the admin Coming Soon tab);
    // rows never ordered there (null) fall after the curated ones, soonest
    // release-date first. The admin Coming Soon list applies the identical
    // comparator so the two views always agree (see app/admin/catalog/page.tsx).
    releases.sort(compareComingSoon);

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
        type: prismaKindToApi(r.kind),
        image: r.coverImage,
        releaseDate: (r.releaseDate ?? new Date()).toISOString(),
        preSmartLinkUrl: r.preSaveUrl ?? null,
        primaryArtist: null,
        featureArtist: null,
        primaryArtistName: primaryNames.join(", ") || null,
        featureLine: featureNames.join(", ") || null,
      };
    });
  } catch (e) {
    console.error("getUpcomingReleases: DB unavailable", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Press items — our own summaries of external coverage. Public readers gate on
// showOnWebsite, and resolve only PUBLIC artists/releases (hidden artists and
// DRAFT/future-SCHEDULED releases must never be linked or named publicly).
// ---------------------------------------------------------------------------

export interface PressItemDTO {
  id: string;
  title: string;
  publisher: string;
  articleUrl: string;
  summary: string;
  image: string | null;
  author: string | null;
  publishedAt: string | null; // ISO
  artists: { id: string; name: string }[];
  releases: { id: string; name: string }[];
  sortOrder: number;
  featured: boolean;
  createdAt: string; // ISO
}

type PressRow = {
  id: string;
  title: string;
  publisher: string;
  articleUrl: string;
  summary: string;
  image: string | null;
  author: string | null;
  publishedAt: Date | null;
  artistIds: string[];
  releaseIds: string[];
  sortOrder: number;
  featured: boolean;
  createdAt: Date;
};

// Public list ordering: curated order first, then newest coverage.
const pressOrderBy = [
  { sortOrder: "asc" as const },
  { publishedAt: "desc" as const },
  { createdAt: "desc" as const },
];

/**
 * Resolve linked artist/release names for a batch of press rows. For public
 * callers (`isAdmin: false`) only live artists and public releases are resolved,
 * so press never names or links to hidden/unreleased catalogue entries.
 */
async function mapPressItems(
  rows: PressRow[],
  { isAdmin }: { isAdmin: boolean }
): Promise<PressItemDTO[]> {
  const artistIds = new Set<string>();
  const releaseIds = new Set<string>();
  for (const r of rows) {
    r.artistIds.forEach((id) => artistIds.add(id));
    r.releaseIds.forEach((id) => releaseIds.add(id));
  }

  const [artists, releases] = await Promise.all([
    artistIds.size
      ? prisma.artist.findMany({
          where: {
            id: { in: Array.from(artistIds) },
            ...(isAdmin ? {} : { showOnWebsite: true }),
          },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    releaseIds.size
      ? prisma.release.findMany({
          where: {
            AND: [
              { id: { in: Array.from(releaseIds) } },
              ...(isAdmin ? [] : [publicReleaseWhere()]),
            ],
          },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const artistById = new Map(artists.map((a) => [a.id, a.name]));
  const releaseById = new Map(releases.map((r) => [r.id, r.name]));

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    publisher: r.publisher,
    articleUrl: r.articleUrl,
    summary: r.summary,
    image: r.image ?? null,
    author: r.author ?? null,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    artists: r.artistIds
      .filter((id) => artistById.has(id))
      .map((id) => ({ id, name: artistById.get(id)! })),
    releases: r.releaseIds
      .filter((id) => releaseById.has(id))
      .map((id) => ({ id, name: releaseById.get(id)! })),
    sortOrder: r.sortOrder,
    featured: r.featured,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** All public press items for the /press page, in curated then newest order. */
export const getAllPress = cache(async (): Promise<PressItemDTO[]> => {
  try {
    const rows = await prisma.pressItem.findMany({
      where: { showOnWebsite: true },
      orderBy: pressOrderBy,
    });
    return await mapPressItems(rows, { isAdmin: false });
  } catch (e) {
    console.error("getAllPress: DB unavailable", e);
    return [];
  }
});

/** Public press items linked to one artist (for the artist page section). */
export const getPressForArtist = cache(
  async (artistId: string): Promise<PressItemDTO[]> => {
    try {
      const rows = await prisma.pressItem.findMany({
        where: { showOnWebsite: true, artistIds: { has: artistId } },
        orderBy: pressOrderBy,
      });
      return await mapPressItems(rows, { isAdmin: false });
    } catch (e) {
      console.error("getPressForArtist: DB unavailable", e);
      return [];
    }
  }
);

/** Public press items linked to one release (for the release page section). */
export const getPressForRelease = cache(
  async (releaseId: string): Promise<PressItemDTO[]> => {
    try {
      const rows = await prisma.pressItem.findMany({
        where: { showOnWebsite: true, releaseIds: { has: releaseId } },
        orderBy: pressOrderBy,
      });
      return await mapPressItems(rows, { isAdmin: false });
    } catch (e) {
      console.error("getPressForRelease: DB unavailable", e);
      return [];
    }
  }
);

/** Internal — exposed for the admin data layer to reuse the name resolution. */
export { mapPressItems };
export type { PressRow };
export { pressOrderBy };
