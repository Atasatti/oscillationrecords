import type { Metadata } from "next";
import MusicHeardSection from "@/components/sections/MusicHeardSection";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import PressCard from "@/components/local-ui/PressCard";
import { getAllPress } from "@/lib/catalog-data";
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

export default async function PressPage() {
  const press = await getAllPress();
  const jsonLd = press.length ? buildPressListJsonLd(press) : null;

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

          {press.length === 0 ? (
            <p className="py-16 text-center text-gray-500">No press yet — check back soon.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {press.map((item) => (
                <PressCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      </ScrollReveal3D>

      <ScrollReveal3D>
        <MusicHeardSection
          heading="Let's get your music heard."
          subtext="Artist, visionary, or just someone with big ideas? We're here to listen. Let's talk."
        />
      </ScrollReveal3D>
    </div>
  );
}
