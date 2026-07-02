// Server-side IndexNow: ping Bing / Yandex / Seznam / Naver to recrawl changed
// public URLs the moment content goes live — complements the sitemap and the
// manual `npm run indexnow`. Best-effort and non-blocking: call it via
// next/server's `after()` so it never delays the response, and it never throws.
//
// Mirrors scripts/indexnow-submit.mjs (same host + key). An IndexNow "key" is
// public by design (served at https://<host>/<key>.txt), so keeping it in source
// is fine; both are overridable via env.

const HOST = process.env.INDEXNOW_HOST || "www.oscillationrecords.com";
const KEY = process.env.INDEXNOW_KEY || "5346c51c561f4547a8731a883408ae69";
// Shared endpoint fans the submission out to every participating engine.
const ENDPOINT = "https://api.indexnow.org/indexnow";

/**
 * Submit site-relative paths (e.g. "/releases/foo") to IndexNow. Never throws.
 * No-ops off production (a local/dev publish still hits prod data but must not
 * spam search engines) and when INDEXNOW_DISABLED=1.
 */
export async function submitToIndexNow(paths: string[]): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.INDEXNOW_DISABLED === "1") return;
  if (!HOST || !KEY) return;

  const urlList = Array.from(new Set(paths))
    .filter(Boolean)
    .map((p) => `https://${HOST}${p.startsWith("/") ? p : `/${p}`}`);
  if (!urlList.length) return;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`IndexNow: HTTP ${res.status} submitting ${urlList.length} URL(s)`);
  } catch (e) {
    console.error("IndexNow submission failed", e);
  }
}
