import { prisma } from "@/lib/prisma";

/**
 * Lightweight {id, name} lists of releases and artists for admin pickers (e.g.
 * linking a task to a release). Includes drafts, since it's an internal picker.
 * Staff-readable (see /api/admin/site-content-refs) so Outreach-role users can link
 * tasks without holding catalog permissions.
 */
export type CatalogRef = { id: string; name: string };
export type CatalogRefs = { releases: CatalogRef[]; artists: CatalogRef[] };

export async function getCatalogRefs(): Promise<CatalogRefs> {
  const [releases, artists] = await Promise.all([
    prisma.release.findMany({
      select: { id: true, name: true },
      orderBy: [{ createdAt: "desc" }],
    }),
    prisma.artist.findMany({
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }],
    }),
  ]);
  return { releases, artists };
}
