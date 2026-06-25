// IndexNow: push our public URLs to participating search engines (Bing, Yandex,
// Seznam, Naver, …) so they (re)crawl them right away instead of waiting to
// discover them organically. Complements — does not replace — the sitemap.
//
// Run AFTER the key file (public/<key>.txt) is deployed and live: IndexNow
// fetches that file to verify ownership before accepting a submission.
//
//   npm run indexnow                 # submit every URL in the live sitemap
//   npm run indexnow -- <url> [url]  # submit only the given URL(s)
//
// Docs: https://www.bing.com/indexnow/getstarted

const HOST = "www.oscillationrecords.com";
const KEY = "5346c51c561f4547a8731a883408ae69";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
// The shared endpoint fans the submission out to every participating engine.
// Bing's own endpoint (https://api.bing.com/indexnow) works identically.
const ENDPOINT = "https://api.indexnow.org/indexnow";

async function getSitemapUrls() {
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`Sitemap fetch failed: HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());
}

async function main() {
  const cliUrls = process.argv.slice(2);
  const urlList = cliUrls.length ? cliUrls : await getSitemapUrls();
  if (!urlList.length) throw new Error("No URLs to submit.");

  // IndexNow rejects the whole batch if any URL is on a different host than the
  // key, so flag stray URLs up front rather than getting an opaque 422.
  const offHost = urlList.filter(
    (u) => u !== `https://${HOST}` && !u.startsWith(`https://${HOST}/`)
  );
  if (offHost.length) {
    console.warn(`WARNING: ${offHost.length} URL(s) are not on ${HOST} (will be rejected):`);
    offHost.forEach((u) => console.warn("  " + u));
  }

  console.log(`Submitting ${urlList.length} URL(s) to ${ENDPOINT} …`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  const body = await res.text().catch(() => "");
  console.log(`HTTP ${res.status} ${res.statusText}`);
  if (body) console.log(body);

  // 200 = accepted; 202 = accepted, key validation pending.
  if (res.status === 200 || res.status === 202) {
    console.log(`✓ Accepted ${urlList.length} URL(s).`);
  } else {
    console.error("✗ Submission rejected. Common causes:");
    console.error(`  403 → key file not reachable at ${KEY_LOCATION}`);
    console.error("  422 → a URL doesn't match the host, or key mismatch");
    console.error("  429 → rate limited; wait and retry");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
