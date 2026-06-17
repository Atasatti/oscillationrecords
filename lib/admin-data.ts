import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { fuzzyScore } from "@/lib/fuzzy";
import {
  mapReleasesToCards,
  releaseCardListArgs,
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
  // Profile completeness, for spotting gaps across a big roster.
  complete: boolean;
  missing: string[]; // any of: "photo" | "bio" | "links" | "genres"
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

function toRow(a: ArtistSelectRow): AdminArtistRow {
  const hasPhoto = Boolean(a.profilePicture);
  const hasBio = (a.biography ?? "").trim().length >= 30;
  const hasAnyLink = LINK_KEYS.some((k) => Boolean((a as Record<string, unknown>)[k]));
  const hasGenres = (a.genres ?? []).length > 0;
  const missing: string[] = [];
  if (!hasPhoto) missing.push("photo");
  if (!hasBio) missing.push("bio");
  if (!hasAnyLink) missing.push("links");
  if (!hasGenres) missing.push("genres");

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
    complete: missing.length === 0,
    missing,
  };
}

// Attach per-page roster stats with exactly TWO extra queries (no N+1):
// one over Releases touching these artists, one PlayEvent groupBy (last 90d).
async function attachStats(rows: AdminArtistRow[]): Promise<AdminArtistRow[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [releases, plays] = await Promise.all([
    prisma.release.findMany({
      where: { primaryArtistIds: { hasSome: ids } },
      select: { primaryArtistIds: true, releaseDate: true },
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
    for (const aid of rel.primaryArtistIds) {
      if (!idSet.has(aid)) continue;
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

  return rows.map((r) => ({
    ...r,
    releaseCount: countById.get(r.id) ?? 0,
    playsLast90d: playsById.get(r.id) ?? 0,
    lastReleaseDate: lastById.get(r.id)?.toISOString() ?? null,
  }));
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
  const orderBy =
    sortField === "name"
      ? [{ name: dir }]
      : sortField === "createdAt"
        ? [{ createdAt: dir }]
        : [{ sortOrder: dir }, { createdAt: "desc" as const }];
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
  return items.map(toRow);
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export type ReleaseSort = "name" | "createdAt" | "kind";

export async function getReleasesPage({
  page = 1,
  pageSize = 25,
  q = "",
  sort = "createdAt",
  dir = "desc",
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
    const ranked = cards
      .map((c) => ({
        c,
        score: Math.max(
          fuzzyScore(query, c.name),
          fuzzyScore(query, c.primaryArtistName || ""),
          fuzzyScore(query, c.artist || "")
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.c);
    const total = ranked.length;
    const safePage = clampPage(page, size, total);
    const start = (safePage - 1) * size;
    return { items: ranked.slice(start, start + size), total, page: safePage, pageSize: size };
  }

  const safePage = Math.max(1, page);
  const orderBy =
    sort === "name"
      ? [{ name: dir }]
      : sort === "kind"
        ? [{ kind: dir }, { createdAt: "desc" as const }]
        : [{ createdAt: dir }];
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
