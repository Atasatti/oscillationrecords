import type { Metadata } from "next";
import { Star } from "lucide-react";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import PressCard from "@/components/local-ui/PressCard";
import { getAllPress, getFeaturedPress } from "@/lib/catalog-data";
import { buildPressListJsonLd, jsonLdScript, SITE_NAME, OG_DEFAULT_IMAGE } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Press & Features",
  description: `Press, reviews, interviews and features covering ${SITE_NAME} and our artists, plus original posts from the independent Manchester record label.`,
  alternates: {
    canonical: "/press",
    types: { "application/rss+xml": [{ url: "/press/feed.xml", title: `${SITE_NAME} — Press` }] },
  },
  openGraph: {
    title: `Press & Features | ${SITE_NAME}`,
    description: `Press, reviews and features covering ${SITE_NAME} artists and releases.`,
    url: "/press",
    images: [OG_DEFAULT_IMAGE],
  },
};

// ISR: keep fresh + CDN-cacheable, matching the rest of the public catalog.
export const revalidate = 60;

// Desktop card grid (hidden on phones). On mobile the page is a single hero
// featured card + a tight list of compact rows instead (see below / PressCard
// mobileRow), so the two layouts are rendered separately per breakpoint.
const DESKTOP_GRID = "hidden gap-6 sm:grid sm:grid-cols-2 lg:grid-cols-3";

export default async function PressPage() {
  // Featured = the curated panel the admin marks via the press "featured" toggle
  // (ordered by homeOrder). The main grid shows everything else so a featured
  // item isn't duplicated on the page.
  const [featured, all] = await Promise.all([getFeaturedPress(), getAllPress()]);
  const featuredIds = new Set(featured.map((p) => p.id));
  const rest = all.filter((p) => !featuredIds.has(p.id));
  const jsonLd = all.length ? buildPressListJsonLd(all) : null;
  // On phones only the TOP featured item is a hero card; any other featured items
  // join the rest as compact rows so the page doesn't open with 5 full-size cards.
  const mobileMore = [...featured.slice(1), ...rest];

  return (
    <div>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      ) : null}

      <ScrollReveal3D>
        <section className="px-4 py-10 text-white sm:px-6 sm:py-14 md:px-[10%]">
          <h1 className="mb-2 text-3xl font-light tracking-tighter">Press &amp; Features</h1>
          <p className="mb-8 max-w-2xl text-sm text-gray-400">
            Coverage of our artists and releases across blogs, magazines and media.
          </p>

          {all.length === 0 ? (
            <p className="py-16 text-center text-gray-500">No press yet — check back soon.</p>
          ) : (
            <>
              {featured.length > 0 ? (
                <div className="mb-8 rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:mb-12 sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-xl font-light tracking-tighter">
                    <Star className="h-4 w-4 text-amber-400" aria-hidden />
                    Featured
                  </h2>
                  {/* Desktop: every featured item as a card. */}
                  <div className={DESKTOP_GRID}>
                    {featured.map((item) => (
                      <PressCard key={item.id} item={item} />
                    ))}
                  </div>
                  {/* Mobile: just the top featured item as a hero card. */}
                  {featured[0] ? (
                    <div className="sm:hidden">
                      <PressCard item={featured[0]} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Desktop "More coverage": the non-featured items as cards. */}
              {rest.length > 0 ? (
                <>
                  {featured.length > 0 ? (
                    <h2 className="mb-4 hidden text-xl font-light tracking-tighter text-gray-300 sm:block">
                      More coverage
                    </h2>
                  ) : null}
                  <div className={DESKTOP_GRID}>
                    {rest.map((item) => (
                      <PressCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              ) : null}

              {/* Mobile "More coverage": overflow featured + everything else as
                  compact, scannable rows. */}
              {mobileMore.length > 0 ? (
                <div className="sm:hidden">
                  {featured.length > 0 ? (
                    <h2 className="mb-4 text-xl font-light tracking-tighter text-gray-300">
                      More coverage
                    </h2>
                  ) : null}
                  <div className="grid grid-cols-1 gap-3">
                    {mobileMore.map((item) => (
                      <PressCard key={item.id} item={item} mobileRow />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </ScrollReveal3D>
    </div>
  );
}
