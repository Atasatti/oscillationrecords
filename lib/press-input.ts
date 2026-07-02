// Shared normalization for PressItem fields. Used by both POST /api/press and
// PATCH /api/press/[pressId] so create and edit stay in lockstep. Mirrors the
// approach in lib/artist-input.ts (cleanStr + typed extractor).

import { isSafeUrl } from "@/lib/url-safety";

/** Max length for a press headline — enforced here, mirrored by the editor's maxLength. */
export const PRESS_TITLE_MAX = 120;
/** Max length for a press summary — enforced here, mirrored by the editor's maxLength. */
export const PRESS_SUMMARY_MAX = 300;
/** Max length for an owned-post Markdown body — generous; guards against abuse. */
export const PRESS_BODY_MAX = 50_000;

export type PressInput = {
  title: string;
  /** Null for an owned post (published by us); the outlet name for external coverage. */
  publisher: string | null;
  /** Null for an owned post (its page is the article); external link for coverage. */
  articleUrl: string | null;
  summary: string;
  /** Markdown body — non-null makes this an OWNED post with its own page. */
  body: string | null;
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
/** An absolute http(s) URL (also blocks javascript:/data: via isSafeUrl). */
const isHttpUrl = (u: string) => isSafeUrl(u) && /^https?:\/\//i.test(u);

export function extractPressInput(
  body: Record<string, unknown>,
  opts?: { draft?: boolean }
): PressInput | null {
  const draft = opts?.draft === true;
  const title = cleanStr(body.title);
  const publisher = cleanStr(body.publisher);
  const summary = cleanStr(body.summary);
  const articleUrl = cleanStr(body.articleUrl);
  const postBody = typeof body.body === "string" ? body.body.trim() : "";
  // A body makes this OUR OWN post (hosted, with its own page); otherwise it's a
  // link-out to external coverage. The two have different required fields.
  const isOwned = postBody.length > 0;

  if (draft) {
    // A DRAFT only needs a title; the rest can be filled before publishing. A
    // provided external URL must still be a valid absolute http(s) one.
    if (!title) return null;
    if (articleUrl && !isHttpUrl(articleUrl)) return null;
  } else if (isOwned) {
    // Owned post: needs a title, an excerpt (summary) and a body. Publisher and an
    // external URL are optional (an owned post may still cross-link somewhere).
    if (!title || !summary || !postBody) return null;
    if (articleUrl && !isHttpUrl(articleUrl)) return null;
  } else {
    // External coverage: needs title, outlet, summary and a valid article URL.
    if (!title || !publisher || !summary || !articleUrl || !isHttpUrl(articleUrl)) return null;
  }

  return {
    // Hard cap on the headline so an over-length title (e.g. a direct API call
    // bypassing the editor's maxLength) can't break the press-card layout.
    title: title.slice(0, PRESS_TITLE_MAX),
    publisher: publisher || null,
    articleUrl: articleUrl || null,
    // Hard cap so an over-length summary can never be stored beyond the limit.
    summary: (summary ?? "").slice(0, PRESS_SUMMARY_MAX),
    body: isOwned ? postBody.slice(0, PRESS_BODY_MAX) : null,
    image: cleanImage(body.image),
    author: cleanStr(body.author),
    publishedAt: parseDate(body.publishedAt),
    artistIds: normalizeIds(body.artistIds),
    releaseIds: normalizeIds(body.releaseIds),
  };
}
