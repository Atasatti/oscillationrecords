import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { fuzzyScore } from "@/lib/fuzzy";
import {
  computeArtistSeo,
  computeArtistGkp,
  type ArtistSeoGrade,
  type ArtistGkpGrade,
} from "@/lib/seo-score";
import {
  mapPressItems,
  mapReleasesToCards,
  pressOrderBy,
  releaseCardListArgs,
  type PressItemDTO,
  type ReleaseCardDTO,
} from "@/lib/catalog-data";

/**
 * Server-side paginated data for the ADMIN management tables. Kept separate from
 * lib/catalog-data.ts (which the public site depends on) so the public data
 * shapes are never affected. Returns a `{items,total,page,pageSize}` envelope.
 */

export interface AdminArtistRow {
  id: string;
  name: string;
  profilePicture: string | null;
  showOnWebsite: boolean;
  featuredOnHome: boolean;
  homeOrder: number;
  spotifyLink: string | null;
  sortOrder: number;
  createdAt: string; // ISO
  genres: string[];
  // At-a-glance roster stats (computed per page, default 0/null).
  releaseCount: number;
  playsLast90d: number;
  lastReleaseDate: string | null; // ISO
  // Per-artist SEO score (0–100) + weight-ordered gaps, for maximising each
  // artist's discoverability across a big roster. See lib/seo-score.ts.
  seoScore: number;
  seoGrade: ArtistSeoGrade;
  // `missing` lists the outstanding SEO gaps, highest-impact first (e.g.
  // "streaming links", "MusicBrainz ID", "fuller bio"). `complete` = nothing left.
  complete: boolean;
  missing: string[];
  // Per-artist Google Knowledge Panel readiness (0–100) + weight-ordered gaps —
  // how ready the artist is to earn a Knowledge Panel (an entity-identity score,
  // distinct from the page-discoverability SEO score). See lib/seo-score.ts.
  gkpScore: number;
  gkpGrade: ArtistGkpGrade;
  gkpComplete: boolean;
  gkpMissing: string[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ArtistSort = "name" | "createdAt" | "sortOrder";
export type SortDir = "asc" | "desc";

export type ArtistVisibility = "all" | "live" | "hidden";
export type ArtistFeatured = "all" | "featured" | "not";

export interface ArtistFilters {
  visibility?: ArtistVisibility;
  featured?: ArtistFeatured;
  genre?: string;
}

const ARTIST_SORTS: Record<ArtistSort, ArtistSort> = {
  name: "name",
  createdAt: "createdAt",
  sortOrder: "sortOrder",
};

const LINK_KEYS = [
  "xLink",
  "tiktokLink",
  "spotifyLink",
  "instagramLink",
  "youtubeLink",
  "facebookLink",
  "appleMusicLink",
  "tidalLink",
  "amazonMusicLink",
  "soundcloudLink",
] as const;

// Select enough to render the row AND derive completeness; the raw bio/link text
// is dropped in toRow so it never ships to the client.
const ROW_SELECT = {
  id: true,
  name: true,
  profilePicture: true,
  showOnWebsite: true,
  featuredOnHome: true,
  homeOrder: true,
  spotifyLink: true,
  sortOrder: true,
  createdAt: true,
  genres: true,
  biography: true,
  // Entity identifiers — strongest `sameAs` signals; scored in the SEO grade and
  // (weighted more heavily) the Knowledge Panel readiness grade.
  wikidataId: true,
  wikipediaUrl: true,
  musicBrainzId: true,
  isni: true,
  xLink: true,
  tiktokLink: true,
  instagramLink: true,
  youtubeLink: true,
  facebookLink: true,
  appleMusicLink: true,
  tidalLink: true,
  amazonMusicLink: true,
  soundcloudLink: true,
} as const;

type ArtistSelectRow = Prisma.ArtistGetPayload<{ select: typeof ROW_SELECT }>;

function clampPage(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function buildWhere(filters: ArtistFilters): Prisma.ArtistWhereInput {
  const where: Prisma.ArtistWhereInput = {};
  if (filters.visibility === "live") where.showOnWebsite = true;
  else if (filters.visibility === "hidden") where.showOnWebsite = false;
  if (filters.featured === "featured") where.featuredOnHome = true;
  else if (filters.featured === "not") where.featuredOnHome = false;
  if (filters.genre && filters.genre.trim()) where.genres = { has: filters.genre.trim() };
  return where;
}

// Raw per-artist signals (minus release count, not yet known) that BOTH the SEO
// and GKP scores derive from. A superset of each score's input shape, so it can
// be spread straight into computeArtistSeo / computeArtistGkp (extra keys are
// ignored). The `_sig` field is internal and dropped before the row leaves
// attachStats.
type RawSignals = {
  hasPhoto: boolean;
  bioLength: number;
  genreCount: number;
  linkCount: number;
  hasMusicBrainz: boolean;
  hasIsni: boolean;
  hasWikidata: boolean;
  hasWikipedia: boolean;
};

type RowWithSignals = AdminArtistRow & { _sig: RawSignals };

function toRow(a: ArtistSelectRow): RowWithSignals {
  const sig: RawSignals = {
    hasPhoto: Boolean(a.profilePicture),
    bioLength: (a.biography ?? "").trim().length,
    genreCount: (a.genres ?? []).length,
    linkCount: LINK_KEYS.filter((k) => Boolean((a as Record<string, unknown>)[k])).length,
    hasMusicBrainz: Boolean(a.musicBrainzId),
    hasIsni: Boolean(a.isni),
    hasWikidata: Boolean(a.wikidataId),
    hasWikipedia: Boolean(a.wikipediaUrl),
  };
  // Provisional scores with releaseCount=0; attachStats refines them. This keeps
  // rows valid for callers that skip attachStats (e.g. getFeaturedArtists).
  const seo = computeArtistSeo({ ...sig, releaseCount: 0 });
  const gkp = computeArtistGkp({ ...sig, releaseCount: 0 });

  return {
    id: a.id,
    name: a.name,
    profilePicture: a.profilePicture ?? null,
    showOnWebsite: a.showOnWebsite,
    featuredOnHome: a.featuredOnHome,
    homeOrder: a.homeOrder,
    spotifyLink: a.spotifyLink ?? null,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
    genres: a.genres ?? [],
    releaseCount: 0,
    playsLast90d: 0,
    lastReleaseDate: null,
    seoScore: seo.score,
    seoGrade: seo.grade,
    complete: seo.missing.length === 0,
    missing: seo.missing,
    gkpScore: gkp.score,
    gkpGrade: gkp.grade,
    gkpComplete: gkp.missing.length === 0,
    gkpMissing: gkp.missing,
    _sig: sig,
  };
}

// Attach per-page roster stats with exactly TWO extra queries (no N+1):
// one over Releases touching these artists, one PlayEvent groupBy (last 90d).
// Also finalises each row's SEO score now that the release count is known.
async function attachStats(rows: RowWithSignals[]): Promise<AdminArtistRow[]> {
  if (rows.length === 0) return rows.map(stripSignals);
  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [releases, plays] = await Promise.all([
    prisma.release.findMany({
      // Count releases where the artist is a PRIMARY or FEATURE artist — matching
      // the public artist page (getArtistDetail), so a feature-only credit (e.g.
      // an MC featured on a track) still shows in the roster's release count.
      where: {
        OR: [{ primaryArtistIds: { hasSome: ids } }, { featureArtistIds: { hasSome: ids } }],
      },
      select: { primaryArtistIds: true, featureArtistIds: true, releaseDate: true },
    }),
    prisma.playEvent.groupBy({
      by: ["artistId"],
      where: { artistId: { in: ids }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const idSet = new Set(ids);
  const countById = new Map<string, number>();
  const lastById = new Map<string, Date>();
  for (const rel of releases) {
    // Dedupe per release so an artist credited as both primary and feature on the
    // same release still counts once.
    const onRelease = new Set<string>();
    for (const aid of [...rel.primaryArtistIds, ...rel.featureArtistIds]) {
      if (idSet.has(aid)) onRelease.add(aid);
    }
    for (const aid of onRelease) {
      countById.set(aid, (countById.get(aid) ?? 0) + 1);
      if (rel.releaseDate) {
        const prev = lastById.get(aid);
        if (!prev || rel.releaseDate > prev) lastById.set(aid, rel.releaseDate);
      }
    }
  }
  const playsById = new Map<string, number>();
  for (const p of plays) {
    if (p.artistId) playsById.set(p.artistId, p._count._all);
  }

  return rows.map((r) => {
    const releaseCount = countById.get(r.id) ?? 0;
    const seo = computeArtistSeo({ ...r._sig, releaseCount });
    const gkp = computeArtistGkp({ ...r._sig, releaseCount });
    return stripSignals({
      ...r,
      releaseCount,
      playsLast90d: playsById.get(r.id) ?? 0,
      lastReleaseDate: lastById.get(r.id)?.toISOString() ?? null,
      seoScore: seo.score,
      seoGrade: seo.grade,
      complete: seo.missing.length === 0,
      missing: seo.missing,
      gkpScore: gkp.score,
      gkpGrade: gkp.grade,
      gkpComplete: gkp.missing.length === 0,
      gkpMissing: gkp.missing,
    });
  });
}

/** Drop the internal `_sig` field so it never ships to the client. */
function stripSignals(r: RowWithSignals): AdminArtistRow {
  const { _sig, ...row } = r;
  void _sig;
  return row;
}

export async function getArtistsPage({
  page = 1,
  pageSize = 25,
  q = "",
  sort = "name",
  dir = "asc",
  filters = {},
}: {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: ArtistSort;
  dir?: SortDir;
  filters?: ArtistFilters;
}): Promise<Page<AdminArtistRow>> {
  const size = Math.min(Math.max(1, pageSize), 100);
  const sortField = ARTIST_SORTS[sort] ?? "sortOrder";
  const query = q.trim();
  const where = buildWhere(filters);

  // Search: fuzzy-rank in JS over the (filtered) roster (parity with the public
  // search), then paginate the ranked result. For no query, use indexed skip/take.
  if (query) {
    const all = await prisma.artist.findMany({ where, select: ROW_SELECT });
    const ranked = all
      .map((a) => ({ a, score: fuzzyScore(query, a.name) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.a);
    const total = ranked.length;
    const safePage = clampPage(page, size, total);
    const start = (safePage - 1) * size;
    const items = await attachStats(ranked.slice(start, start + size).map(toRow));
    return { items, total, page: safePage, pageSize: size };
  }

  const safePage = Math.max(1, page);
  // Clamp dir: the route casts a raw query string to SortDir, so guard it —
  // Prisma's orderBy only accepts "asc"/"desc" and throws otherwise.
  const safeDir: SortDir = dir === "desc" ? "desc" : "asc";
  const orderBy =
    sortField === "name"
      ? [{ name: safeDir }]
      : sortField === "createdAt"
        ? [{ createdAt: safeDir }]
        : [{ sortOrder: safeDir }, { name: "asc" as const }];
  // Run the count and the page query in parallel to halve the DB round-trips.
  const [total, rows] = await Promise.all([
    prisma.artist.count({ where }),
    prisma.artist.findMany({
      where,
      select: ROW_SELECT,
      orderBy,
      skip: (safePage - 1) * size,
      take: size,
    }),
  ]);

  const items = await attachStats(rows.map(toRow));
  return { items, total, page: safePage, pageSize: size };
}

/** Distinct genre tags across the roster, for the filter dropdown. */
export async function getDistinctGenres(): Promise<string[]> {
  const rows = await prisma.artist.findMany({ select: { genres: true } });
  const set = new Set<string>();
  for (const r of rows) for (const g of r.genres ?? []) if (g.trim()) set.add(g.trim());
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Featured artists in home-carousel order (for the admin "Home order" tab). */
export async function getFeaturedArtists(): Promise<AdminArtistRow[]> {
  const items = await prisma.artist.findMany({
    where: { featuredOnHome: true },
    select: ROW_SELECT,
    orderBy: [{ homeOrder: "asc" }, { name: "asc" }],
  });
  return items.map((a) => stripSignals(toRow(a)));
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export type ReleaseSort = "name" | "createdAt" | "kind" | "sortOrder";

export async function getReleasesPage({
  page = 1,
  pageSize = 25,
  q = "",
  sort = "sortOrder",
  dir = "asc",
  status,
}: {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: ReleaseSort;
  dir?: SortDir;
  status?: "DRAFT" | "SCHEDULED" | "RELEASED";
}): Promise<Page<ReleaseCardDTO>> {
  const size = Math.min(Math.max(1, pageSize), 100);
  const query = q.trim();
  const where = status ? { status } : undefined;

  // Search: shape all releases then fuzzy-rank by name / artist line (parity with
  // the public search), then paginate.
  if (query) {
    const all = await prisma.release.findMany({ ...releaseCardListArgs, where });
    const cards = await mapReleasesToCards(all, { isAdmin: true });
    // Also match on TRACK titles so searching a song name surfaces the release
    // that contains it (the list shows releases, not individual tracks).
    const trackRows = await prisma.track.findMany({
      where: { releaseId: { in: all.map((r) => r.id) } },
      select: { releaseId: true, name: true },
    });
    const trackNamesByRelease = new Map<string, string[]>();
    for (const t of trackRows) {
      const arr = trackNamesByRelease.get(t.releaseId);
      if (arr) arr.push(t.name);
      else trackNamesByRelease.set(t.releaseId, [t.name]);
    }
    const ranked = cards
      .map((c) => {
        const trackScore = (trackNamesByRelease.get(c.id) ?? []).reduce(
          (max, n) => Math.max(max, fuzzyScore(query, n)),
          0
        );
        return {
          c,
          score: Math.max(
            fuzzyScore(query, c.name),
            fuzzyScore(query, c.primaryArtistName || ""),
            fuzzyScore(query, c.artist || ""),
            trackScore
          ),
        };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.c);
    const total = ranked.length;
    const safePage = clampPage(page, size, total);
    const start = (safePage - 1) * size;
    return { items: ranked.slice(start, start + size), total, page: safePage, pageSize: size };
  }

  const safePage = Math.max(1, page);
  // Clamp dir (route casts a raw query string to SortDir; Prisma only accepts asc/desc).
  const safeDir: SortDir = dir === "desc" ? "desc" : "asc";
  const orderBy =
    sort === "name"
      ? [{ name: safeDir }]
      : sort === "kind"
        ? [{ kind: safeDir }, { createdAt: "desc" as const }]
        : sort === "sortOrder"
          ? [{ sortOrder: safeDir }, { createdAt: "desc" as const }]
          : [{ createdAt: safeDir }];
  // Count + page query in parallel; then resolve artist names.
  const [total, rows] = await Promise.all([
    prisma.release.count({ where }),
    prisma.release.findMany({
      ...releaseCardListArgs,
      where,
      orderBy,
      skip: (safePage - 1) * size,
      take: size,
    }),
  ]);
  const items = await mapReleasesToCards(rows, { isAdmin: true });
  return { items, total, page: safePage, pageSize: size };
}

/** Featured releases in carousel order (for the releases "Home order" tab). */
export async function getFeaturedReleases(): Promise<ReleaseCardDTO[]> {
  const rows = await prisma.release.findMany({
    ...releaseCardListArgs,
    where: { showOnHome: true },
    orderBy: [{ homeOrder: "asc" }, { createdAt: "desc" }],
  });
  return mapReleasesToCards(rows, { isAdmin: true });
}

// ---------------------------------------------------------------------------
// Press
// ---------------------------------------------------------------------------

/** Admin press row = the public DTO plus the visibility flag (admin-only). */
export type AdminPressRow = PressItemDTO & { showOnWebsite: boolean };

/**
 * Paginated press items for the admin manage table. Resolves linked
 * artist/release names regardless of their public visibility (isAdmin: true).
 * Fuzzy search ranks by title / publisher (parity with the public/other tables).
 */
export async function getPressPage({
  page = 1,
  pageSize = 25,
  q = "",
}: {
  page?: number;
  pageSize?: number;
  q?: string;
}): Promise<Page<AdminPressRow>> {
  const size = Math.min(Math.max(1, pageSize), 100);
  const query = q.trim();

  // Attach the admin-only showOnWebsite flag onto each mapped DTO by id.
  const withVisibility = async (
    rows: { id: string; showOnWebsite: boolean }[]
  ): Promise<AdminPressRow[]> => {
    const visById = new Map(rows.map((r) => [r.id, r.showOnWebsite]));
    const dtos = await mapPressItems(rows as never, { isAdmin: true });
    return dtos.map((d) => ({ ...d, showOnWebsite: visById.get(d.id) ?? true }));
  };

  if (query) {
    const all = await prisma.pressItem.findMany({ orderBy: pressOrderBy });
    const ranked = all
      .map((r) => ({
        r,
        score: Math.max(fuzzyScore(query, r.title), fuzzyScore(query, r.publisher)),
      }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.r);
    const total = ranked.length;
    const safePage = clampPage(page, size, total);
    const start = (safePage - 1) * size;
    const items = await withVisibility(ranked.slice(start, start + size));
    return { items, total, page: safePage, pageSize: size };
  }

  const safePage = Math.max(1, page);
  const [total, rows] = await Promise.all([
    prisma.pressItem.count(),
    prisma.pressItem.findMany({
      orderBy: pressOrderBy,
      skip: (safePage - 1) * size,
      take: size,
    }),
  ]);
  const items = await withVisibility(rows);
  return { items, total, page: safePage, pageSize: size };
}
