"use client";

// Tiny module-scoped stale-while-revalidate cache for the admin list pages.
//
// The admin tables are client components that fetch in a useEffect on mount, so
// navigating away and back remounts them → spinner → full refetch every time.
// This store lives OUTSIDE React (module scope), so it survives client-side
// navigations: returning to a page reads the last result instantly and shows it
// while a fresh fetch revalidates in the background. It's cleared on a full page
// reload (and can be cleared explicitly after a mutation). Keyed by request URL.

const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Drop everything (call after a write so stale rows don't linger on revisit). */
export function clearCached(): void {
  store.clear();
}
