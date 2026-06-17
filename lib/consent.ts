// Cookie-consent + anonymous-visitor helpers. Client-safe (no next/headers import);
// route handlers read/write cookies via Request/Response, the banner reads via
// document.cookie.

/** Readable cookie holding the visitor's consent choice. */
export const CONSENT_COOKIE = "osc_consent";
/** httpOnly first-party anonymous analytics id — only set with analytics consent. */
export const VISITOR_COOKIE = "osc_vid";
/** httpOnly session id, sliding 30-min window — groups events into a "visit". */
export const SESSION_COOKIE = "osc_sid";

export const SESSION_MAX_AGE = 60 * 30; // 30 minutes (re-set on each event = sliding)

export type ConsentValue = "all" | "essential";

/** Window event the footer dispatches to reopen the consent banner on demand. */
export const OPEN_CONSENT_EVENT = "osc:open-consent";

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

/** Existing session id if valid, else a fresh one (sliding window resets via cookie). */
export function nextSessionId(existing: string | null | undefined): string {
  return existing && existing.length >= 8 ? existing : crypto.randomUUID();
}

/** Extract UTM campaign params from a URL query string (trimmed/capped). */
export function parseUtm(search: string): {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} {
  try {
    const p = new URLSearchParams(search);
    const g = (k: string) => {
      const v = p.get(k);
      return v ? v.slice(0, 120) : null;
    };
    return { utmSource: g("utm_source"), utmMedium: g("utm_medium"), utmCampaign: g("utm_campaign") };
  } catch {
    return { utmSource: null, utmMedium: null, utmCampaign: null };
  }
}

/** Read the consent choice from document.cookie (client-only). */
export function readConsentClient(): ConsentValue | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)osc_consent=([^;]+)/);
  if (!m) return null;
  const v = decodeURIComponent(m[1]);
  return v === "all" || v === "essential" ? v : null;
}
