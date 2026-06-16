import MusicHeardSection from "@/components/sections/MusicHeardSection";
import NewMusicSection from "@/components/sections/NewMusicSection";
import ReleasesSection from "@/components/sections/ReleasesSection";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import { getCarouselReleases, getPublicReleases } from "@/lib/catalog-data";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Music",
  description:
    "New music and the full release catalogue from Oscillation Records — singles, EPs, and albums.",
  alternates: { canonical: "/releases" },
  openGraph: {
    title: "Music | Oscillation Records",
    description: "New music and the full release catalogue from Oscillation Records.",
    url: "/releases",
  },
};

// ISR: keep the catalog fresh and CDN-cacheable (matches the API's s-maxage=60).
export const revalidate = 60;

export default async function Releases() {
  // Fetch on the server in parallel so the page ships with data in the initial
  // HTML — no client hydrate-then-fetch waterfall or loading spinners.
  const [carouselReleases, allReleases] = await Promise.all([
    getCarouselReleases(),
    getPublicReleases(),
  ]);

  return (
    <div>
      <ScrollReveal3D>
        <NewMusicSection initialReleases={carouselReleases} />
      </ScrollReveal3D>
      <ScrollReveal3D>
        <ReleasesSection initialReleases={allReleases} />
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
