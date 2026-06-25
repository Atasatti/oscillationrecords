import type { Metadata } from "next";
import { Star } from "lucide-react";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import PressCard from "@/components/local-ui/PressCard";
import { getAllPress, getFeaturedPress } from "@/lib/catalog-data";
import { buildPressListJsonLd, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Press & Features",
  description: `Press, reviews and features covering ${SITE_NAME} artists and releases.`,
  alternates: { canonical: "/press" },
  openGraph: {
    title: `Press & Features | ${SITE_NAME}`,
    description: `Press, reviews and features covering ${SITE_NAME} artists and releases.`,
    url: "/press",
  },
};

// ISR: keep fresh + CDN-cacheable, matching the rest of the public catalog.
export const revalidate = 60;

const GRID = "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3";

export default async function PressPage() {
  // Featured = the curated panel the admin marks via the press "featured" toggle
  // (ordered by homeOrder). The main grid shows everything else so a featured
  // item isn't duplicated on the page.
  const [featured, all] = await Promise.all([getFeaturedPress(), getAllPress()]);
  const featuredIds = new Set(featured.map((p) => p.id));
  const rest = all.filter((p) => !featuredIds.has(p.id));
  const jsonLd = all.length ? buildPressListJsonLd(all) : null;

  return (
    <div>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <ScrollReveal3D>
        <section className="px-[10%] py-14 text-white">
          <h1 className="mb-2 text-3xl font-light tracking-tighter">Press &amp; Features</h1>
          <p className="mb-8 max-w-2xl text-sm text-gray-400">
            Coverage of our artists and releases across blogs, magazines and media.
          </p>

          {all.length === 0 ? (
            <p className="py-16 text-center text-gray-500">No press yet — check back soon.</p>
          ) : (
            <>
              {featured.length > 0 ? (
                <div className="mb-12 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-xl font-light tracking-tighter">
                    <Star className="h-4 w-4 text-amber-400" aria-hidden />
                    Featured
                  </h2>
                  <div className={GRID}>
                    {featured.map((item) => (
                      <PressCard key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ) : null}

              {rest.length > 0 ? (
                <>
                  {featured.length > 0 ? (
                    <h2 className="mb-4 text-xl font-light tracking-tighter text-gray-300">
                      More coverage
                    </h2>
                  ) : null}
                  <div className={GRID}>
                    {rest.map((item) => (
                      <PressCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          )}
        </section>
      </ScrollReveal3D>
    </div>
  );
}
