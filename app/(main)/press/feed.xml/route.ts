import { getAllPress } from "@/lib/catalog-data";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo";

// RSS 2.0 feed of the press stream (owned posts + external coverage). Feed readers,
// news-style discovery, and some AI ingestion pipelines expect this; the data
// (summary, publishedAt, slug) already exists. Cached like the rest of the catalog.
export const revalidate = 300;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const items = await getAllPress();
  const feedUrl = `${SITE_URL}/press/feed.xml`;
  const pressUrl = `${SITE_URL}/press`;

  const entries = items
    .map((p) => {
      // Owned posts point at their own page; external coverage points at the outlet.
      const link = p.isOwned ? absoluteUrl(`/press/${p.slug}`) : p.articleUrl || pressUrl;
      const when = p.publishedAt || p.createdAt;
      const pubDate = when ? new Date(when).toUTCString() : "";
      const summary = p.publisher && !p.isOwned ? `${p.publisher} — ${p.summary}` : p.summary;
      return [
        "    <item>",
        `      <title>${xmlEscape(p.title)}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="${p.isOwned}">${xmlEscape(p.isOwned ? link : p.id)}</guid>`,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : "",
        summary ? `      <description>${xmlEscape(summary)}</description>` : "",
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(`${SITE_NAME} — Press`)}</title>
    <link>${xmlEscape(pressUrl)}</link>
    <atom:link href="${xmlEscape(feedUrl)}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(
      `Press, reviews and features covering ${SITE_NAME} and our artists, plus our own posts.`
    )}</description>
    <language>en</language>
${entries}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
