import { revalidateTag } from "next/cache";

/**
 * Server-side cache tags for the admin catalog list data (see the `unstable_cache`
 * wrappers in lib/admin-data.ts). These let a write instantly bust the cached
 * lists so an edit shows immediately, instead of waiting out the TTL.
 */
export const ADMIN_TAGS = {
  releases: "admin:releases",
  artists: "admin:artists",
  press: "admin:press",
} as const;

/**
 * TTL backstop (seconds) for the cached admin lists. Writes bust the tag
 * immediately (see {@link revalidateAdminCatalog}); this only bounds staleness
 * for any write path that isn't wired to invalidate — nothing is stale longer
 * than this.
 */
export const ADMIN_CACHE_REVALIDATE = 60;

/**
 * Bust ALL cached admin catalog lists after a write. Coarse on purpose: artist
 * roster stats depend on releases/tracks, and release cards render artist names,
 * so a change in one domain can affect another's list. Calling this after any
 * catalog mutation keeps every list correct. Safe to call from Route Handlers /
 * Server Actions (a no-op outside a request context is tolerated).
 */
export function revalidateAdminCatalog(): void {
  try {
    revalidateTag(ADMIN_TAGS.releases);
    revalidateTag(ADMIN_TAGS.artists);
    revalidateTag(ADMIN_TAGS.press);
  } catch {
    // revalidateTag throws outside a request scope (e.g. a CLI script writing via
    // Prisma). The list TTL still bounds staleness, so swallow it.
  }
}
