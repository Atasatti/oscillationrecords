import { prisma } from "@/lib/prisma";
import { fuzzyScore } from "@/lib/fuzzy";

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
  spotifyLink: string | null;
  sortOrder: number;
  createdAt: string; // ISO
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ArtistSort = "name" | "createdAt" | "sortOrder";
export type SortDir = "asc" | "desc";

const ARTIST_SORTS: Record<ArtistSort, ArtistSort> = {
  name: "name",
  createdAt: "createdAt",
  sortOrder: "sortOrder",
};

function clampPage(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(Math.max(1, page), totalPages);
}

function toRow(a: {
  id: string;
  name: string;
  profilePicture: string | null;
  showOnWebsite: boolean;
  spotifyLink: string | null;
  sortOrder: number;
  createdAt: Date;
}): AdminArtistRow {
  return {
    id: a.id,
    name: a.name,
    profilePicture: a.profilePicture ?? null,
    showOnWebsite: a.showOnWebsite,
    spotifyLink: a.spotifyLink ?? null,
    sortOrder: a.sortOrder,
    createdAt: a.createdAt.toISOString(),
  };
}

const ROW_SELECT = {
  id: true,
  name: true,
  profilePicture: true,
  showOnWebsite: true,
  spotifyLink: true,
  sortOrder: true,
  createdAt: true,
} as const;

export async function getArtistsPage({
  page = 1,
  pageSize = 25,
  q = "",
  sort = "sortOrder",
  dir = "asc",
}: {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: ArtistSort;
  dir?: SortDir;
}): Promise<Page<AdminArtistRow>> {
  const size = Math.min(Math.max(1, pageSize), 100);
  const sortField = ARTIST_SORTS[sort] ?? "sortOrder";
  const query = q.trim();

  // Search: fuzzy-rank in JS over the roster (parity with the public search),
  // then paginate the ranked result. For no query, use indexed skip/take.
  if (query) {
    const all = await prisma.artist.findMany({ select: ROW_SELECT });
    const ranked = all
      .map((a) => ({ a, score: fuzzyScore(query, a.name) }))
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.a);
    const total = ranked.length;
    const safePage = clampPage(page, size, total);
    const start = (safePage - 1) * size;
    return {
      items: ranked.slice(start, start + size).map(toRow),
      total,
      page: safePage,
      pageSize: size,
    };
  }

  const total = await prisma.artist.count();
  const safePage = clampPage(page, size, total);
  const orderBy =
    sortField === "name"
      ? [{ name: dir }]
      : sortField === "createdAt"
        ? [{ createdAt: dir }]
        : [{ sortOrder: dir }, { createdAt: "desc" as const }];
  const items = await prisma.artist.findMany({
    select: ROW_SELECT,
    orderBy,
    skip: (safePage - 1) * size,
    take: size,
  });

  return { items: items.map(toRow), total, page: safePage, pageSize: size };
}
