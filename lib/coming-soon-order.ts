// Client-safe (no server imports) so both the public server reader
// (lib/catalog-data.ts → getUpcomingReleases) and the admin client list
// (app/admin/catalog/page.tsx) sort the home "Coming Soon" strip identically.

const COMING_SOON_LAST = Number.MAX_SAFE_INTEGER;

type ComingSoonSortable = {
  comingSoonOrder: number | null;
  releaseDate: Date | string | null;
  createdAt: Date | string;
};

/**
 * Ordering for the "Coming Soon" strip: curated rows (a set comingSoonOrder)
 * first in that order, then rows never ordered there (null) by soonest release
 * date, with oldest-created as the final tiebreak. Used verbatim on both the
 * public strip and the admin reorder list so the two never disagree.
 */
export function compareComingSoon(
  a: ComingSoonSortable,
  b: ComingSoonSortable
): number {
  const ao = a.comingSoonOrder ?? COMING_SOON_LAST;
  const bo = b.comingSoonOrder ?? COMING_SOON_LAST;
  if (ao !== bo) return ao - bo;
  const ad = a.releaseDate ? new Date(a.releaseDate).getTime() : COMING_SOON_LAST;
  const bd = b.releaseDate ? new Date(b.releaseDate).getTime() : COMING_SOON_LAST;
  if (ad !== bd) return ad - bd;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}
