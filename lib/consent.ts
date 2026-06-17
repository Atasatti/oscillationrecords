// Cookie-consent + anonymous-visitor helpers. Client-safe (no next/headers import);
// route handlers read/write cookies via Request/Response, the banner reads via
// document.cookie.

/** Readable cookie holding the visitor's consent choice. */
export const CONSENT_COOKIE = "osc_consent";
/** httpOnly first-party anonymous analytics id — only set with analytics consent. */
export const VISITOR_COOKIE = "osc_vid";

export type ConsentValue = "all" | "essential";

export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/** True when the visitor has opted into analytics cookies. */
export function hasAnalyticsConsent(value: string | null | undefined): boolean {
  return value === "all";
}

/**
 * Coarse, non-precise geo from CDN headers (country + city only). Best-effort —
 * absent in local dev. Never stores IP. Works behind Vercel or Cloudflare.
 */
export function geoFromHeaders(h: Headers): { country: string | null; city: string | null } {
  const country =
    h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || null;
  const cityRaw = h.get("x-vercel-ip-city");
  const city = cityRaw ? decodeURIComponent(cityRaw).trim() || null : null;
  return { country: country ? country.toUpperCase() : null, city };
}

/** Read the consent choice from document.cookie (client-only). */
export function readConsentClient(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)osc_consent=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "all" || v === "essential" ? v : null;
}
