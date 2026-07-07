// Content / social calendar (ContentPost) — planned posts across platforms,
// optionally tied to a release. Pure — safe to import on server or client.

export const CONTENT_PLATFORMS = [
  "instagram", "tiktok", "twitter", "youtube", "facebook", "newsletter", "other",
] as const;
export type ContentPlatform = (typeof CONTENT_PLATFORMS)[number];

export const CONTENT_PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "X / Twitter",
  youtube: "YouTube",
  facebook: "Facebook",
  newsletter: "Newsletter",
  other: "Other",
};

export const CONTENT_STATUSES = ["idea", "drafted", "scheduled", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  idea: "Idea",
  drafted: "Drafted",
  scheduled: "Scheduled",
  published: "Published",
};

export function isContentPlatform(v: unknown): v is ContentPlatform {
  return typeof v === "string" && (CONTENT_PLATFORMS as readonly string[]).includes(v);
}

export function isContentStatus(v: unknown): v is ContentStatus {
  return typeof v === "string" && (CONTENT_STATUSES as readonly string[]).includes(v);
}

export const contentStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const isObjectId = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f\d]{24}$/i.test(v);

/** An optional release id — a 24-hex ObjectId or null (never a bad string). */
export function normalizeReleaseId(v: unknown): string | null {
  return isObjectId(v) ? v : null;
}

/** An asset link — only http(s) URLs, so a stored value can't become a
 *  javascript:/data: href when rendered. Non-http(s) input is dropped. */
export function safeUrl(v: unknown): string | null {
  const s = contentStr(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

/** "YYYY-MM-DD" (from a <input type=date> or a Date) → a Date at UTC midnight of
 *  that calendar day, or null if unparseable. Storing at UTC midnight keeps a
 *  post pinned to the same day for every viewer regardless of timezone. */
export function toUtcDay(v: unknown): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  // Date-only "YYYY-MM-DD", optionally with a time part (an ISO string is fine);
  // anchored so trailing garbage ("2026-07-03oops") is rejected, not ignored.
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const dt = new Date(ms);
  // Reject impossible dates (e.g. 2026-02-31 rolls over — parts won't round-trip).
  if (
    dt.getUTCFullYear() !== Number(y) ||
    dt.getUTCMonth() !== Number(mo) - 1 ||
    dt.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return dt;
}

/** "YYYY-MM-DD" for a date, in UTC terms (the key the calendar groups by). */
export function dayKeyUtc(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export type ContentPostInput = {
  releaseId: string | null;
  title: string;
  platform: ContentPlatform;
  scheduledFor: Date;
  status: ContentStatus;
  copy: string | null;
  assetLink: string | null;
  notes: string | null;
};

/** Clean a full create body. Returns null if required fields (title, a valid
 *  date) are missing, so the route can 400 without a half-built record. */
export function normalizeContentPostInput(body: unknown): ContentPostInput | null {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const title = contentStr(o.title, 200);
  const scheduledFor = toUtcDay(o.scheduledFor);
  if (!title || !scheduledFor) return null;
  return {
    releaseId: normalizeReleaseId(o.releaseId),
    title,
    platform: isContentPlatform(o.platform) ? o.platform : "instagram",
    scheduledFor,
    status: isContentStatus(o.status) ? o.status : "idea",
    copy: contentStr(o.copy, 5000),
    assetLink: safeUrl(o.assetLink),
    notes: contentStr(o.notes, 2000),
  };
}
