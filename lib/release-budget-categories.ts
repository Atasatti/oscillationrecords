// Release-budget spend categories — the kinds of cost logged against a release's
// budget (production, creative, distribution and promo). Pure and client-safe (no
// prisma / server-only imports), so the server (spend validation + the cross-release
// rollup, via lib/release-budget) and the client budget panel share ONE source of
// truth for the vocabulary, its labels and its ordering — no drifting duplicate lists.
//
// Keys are STABLE ids stored on Release.spend[].category. Never rename a key (relabel
// it instead), and only append new ones — otherwise already-logged spend loses its
// category and falls back to "Other".

export const SPEND_CATEGORIES = [
  // Production / creative
  "recording",
  "mixing",
  "photography",
  "artwork",
  "video",
  // Release
  "distribution",
  // Promotion
  "playlist",
  "ads",
  "pr",
  "radio",
  // Catch-all
  "other",
] as const;

export type SpendCategory = (typeof SPEND_CATEGORIES)[number];

export const SPEND_CATEGORY_LABELS: Record<SpendCategory, string> = {
  recording: "Recording / production",
  mixing: "Mixing & mastering",
  photography: "Photography",
  artwork: "Artwork / design",
  video: "Music video",
  distribution: "Distribution",
  playlist: "Playlist / curators",
  ads: "Ads",
  pr: "PR / press",
  radio: "Radio",
  other: "Other",
};

export function isSpendCategory(v: unknown): v is SpendCategory {
  return typeof v === "string" && (SPEND_CATEGORIES as readonly string[]).includes(v);
}

/** Ordered { value, label } options for a category <select>. */
export const SPEND_CATEGORY_OPTIONS: readonly { value: SpendCategory; label: string }[] =
  SPEND_CATEGORIES.map((value) => ({ value, label: SPEND_CATEGORY_LABELS[value] }));

/** Default selection for a fresh spend entry (the first, i.e. earliest-lifecycle, cost). */
export const DEFAULT_SPEND_CATEGORY: SpendCategory = SPEND_CATEGORIES[0];

/** Human label for a stored category value (unknown / legacy → "Other"). */
export function spendCategoryLabel(v: string): string {
  return isSpendCategory(v) ? SPEND_CATEGORY_LABELS[v] : "Other";
}
