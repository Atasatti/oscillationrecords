// Shared normalization for PressItem fields. Used by both POST /api/press and
// PATCH /api/press/[pressId] so create and edit stay in lockstep. Mirrors the
// approach in lib/artist-input.ts (cleanStr + typed extractor).

import { isSafeUrl } from "@/lib/url-safety";

/** Max length for a press summary — enforced here, mirrored by the editor's maxLength. */
export const PRESS_SUMMARY_MAX = 300;

export type PressInput = {
  title: string;
  publisher: string;
  articleUrl: string;
  summary: string;
  image: string | null;
  author: string | null;
  publishedAt: Date | null;
  artistIds: string[];
  releaseIds: string[];
};

const cleanStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

/** A 24-char hex Mongo ObjectId — guards the loose-id arrays before they hit Prisma. */
const isObjectId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f\d]{24}$/i.test(v.trim());

/** Accept `string[]` (or a single string) → trimmed, valid ObjectIds, de-duped. */
function normalizeIds(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!isObjectId(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Parse an ISO date / yyyy-mm-dd string into a Date, or null if absent/invalid. */
function parseDate(input: unknown): Date | null {
  const s = cleanStr(input);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Trim and accept only absolute http(s) image URLs; null otherwise. */
function cleanImage(input: unknown): string | null {
  const s = cleanStr(input);
  if (!s) return null;
  return isSafeUrl(s) && /^https?:\/\//i.test(s) ? s : null;
}

/**
 * Extract + normalize a PressItem from a request body. Returns null when a
 * required field (title, publisher, summary, or a valid absolute articleUrl) is
 * missing so the route can answer 400. The `articleUrl` must be an absolute
 * http(s) URL (link-out), not a site-relative path.
 */
export function extractPressInput(
  body: Record<string, unknown>,
  opts?: { draft?: boolean }
): PressInput | null {
  const draft = opts?.draft === true;
  const title = cleanStr(body.title);
  const publisher = cleanStr(body.publisher);
  const summary = cleanStr(body.summary);
  const articleUrl = cleanStr(body.articleUrl);

  // A DRAFT only needs a title — publisher / summary / article URL can be filled
  // in before publishing. A provided URL must still be a valid absolute http(s)
  // one; publishing requires all four.
  if (draft) {
    if (!title) return null;
    if (articleUrl && (!isSafeUrl(articleUrl) || !/^https?:\/\//i.test(articleUrl))) return null;
  } else {
    if (!title || !publisher || !summary || !articleUrl) return null;
    if (!isSafeUrl(articleUrl) || !/^https?:\/\//i.test(articleUrl)) return null;
  }

  return {
    title,
    // Required columns — a draft stores "" for anything not yet filled in.
    publisher: publisher ?? "",
    articleUrl: articleUrl ?? "",
    // Hard cap so an over-length summary (e.g. a direct API call bypassing the
    // editor's maxLength) can never be stored beyond the limit.
    summary: (summary ?? "").slice(0, PRESS_SUMMARY_MAX),
    image: cleanImage(body.image),
    author: cleanStr(body.author),
    publishedAt: parseDate(body.publishedAt),
    artistIds: normalizeIds(body.artistIds),
    releaseIds: normalizeIds(body.releaseIds),
  };
}
