"use client";

// Tiny module-scoped stale-while-revalidate cache for the admin list pages.
//
// The admin tables are client components that fetch in a useEffect on mount, so
// navigating away and back remounts them → spinner → full refetch every time.
// This store lives OUTSIDE React (module scope), so it survives client-side
// navigations: returning to a page reads the last result instantly and shows it
// while a fresh fetch revalidates in the background. It's cleared on a full page
// reload (and can be cleared explicitly after a mutation). Keyed by request URL.

// How long a cached view is considered "fresh". Within this window, revisiting
// a page serves purely from cache with NO network call; past it, the cache is
// still shown instantly but a background revalidation fetch runs (SWR). A write
// (clearCached) always wins regardless of age.
export const ADMIN_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

type Entry = { value: unknown; at: number };
const store = new Map<string, Entry>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, { value, at: Date.now() });
}

/** True if the cached entry exists and is younger than `maxAgeMs`. */
export function isFresh(key: string, maxAgeMs: number = ADMIN_CACHE_TTL_MS): boolean {
  const e = store.get(key);
  return !!e && Date.now() - e.at < maxAgeMs;
}

/** Drop everything (call after a write so stale rows don't linger on revisit). */
export function clearCached(): void {
  store.clear();
}
