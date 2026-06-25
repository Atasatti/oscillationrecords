import Navbar from "@/components/local-ui/Navbar";
import HomeHeroSection from "@/components/sections/HomeHeroSection";
import MeetArtistSection from "@/components/sections/MeetArtistSection";
import MusicHeardSection from "@/components/sections/MusicHeardSection";
import NewMusicSection from "@/components/sections/NewMusicSection";
import NoProfitSection from "@/components/sections/NoProfitSection";
import UpcomingReleasesSection from "@/components/sections/UpcomingReleasesSection";
import Footer from "@/components/local-ui/Footer";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import {
  getCarouselReleases,
  getHomeArtists,
  getUpcomingReleases,
} from "@/lib/catalog-data";
import { buildOrganizationJsonLd, buildWebSiteJsonLd } from "@/lib/seo";
import { getFooterSocialLinks } from "@/lib/footer-settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  // Home keeps the brand name as-is (no "%s | …" template) and is the canonical root.
  title: { absolute: "Oscillation Records — A Record Label That Puts Artists First" },
  alternates: { canonical: "/" },
};

// Re-render at most once a minute (ISR) so the catalog stays fresh and the page
// is CDN-cacheable, mirroring the s-maxage=60 the API routes use.
export const revalidate = 60;

export default async function Home() {
  // Fetch the page's data on the server, in parallel, so it ships in the initial
  // HTML — no client hydrate-then-fetch waterfall or loading spinners.
  const [upcomingReleases, carouselReleases, artists, footerLinks] = await Promise.all([
    getUpcomingReleases(),
    getCarouselReleases(),
    getHomeArtists(),
    getFooterSocialLinks(),
  ]);

  // The label's own social profiles → schema.org `sameAs`, so Google can reconcile
  // "Oscillation Records" to its Spotify/Instagram/etc. (stronger entity + better
  // shot at a knowledge panel).
  const labelSameAs = [
    footerLinks.xLink,
    footerLinks.tiktokLink,
    footerLinks.youtubeLink,
    footerLinks.instagramLink,
    footerLinks.facebookLink,
    footerLinks.spotifyLink,
    footerLinks.soundcloudLink,
    footerLinks.bandcampLink,
    footerLinks.beatportLink,
  ].filter((u): u is string => Boolean(u && u.trim()));

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildOrganizationJsonLd({ sameAs: labelSameAs })),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildWebSiteJsonLd()),
        }}
      />
      <Navbar />
      {/* Single <main> landmark for the homepage (it uses the root layout, not
          the (main) group, so it needs its own). */}
      <main>
        {/* The page's primary heading. The hero is a 3D scene with no text, so
            the <h1> is visually hidden (sr-only) but present in the DOM for
            search engines / screen readers — it carries the brand + the primary
            keywords, mirroring the page <title>. */}
        <h1 className="sr-only">
          Oscillation Records — A Record Label That Puts Artists First
        </h1>
        {/* Canonical, crawlable entity definition. Visually hidden so it leaves
            the designed hero untouched, but present in the DOM for search
            engines / AI Overviews to extract and attribute to this site — and to
            disambiguate from the similarly-named "The Oscillation" project. */}
        <p className="sr-only">
          Oscillation Records is an independent UK record label (company no.
          15579381) built on a simple principle: put artists first. It is a
          distinct label and is not affiliated with The Oscillation, the
          psych-rock project led by Demian Castellanos.
        </p>
        {/* HomeHeroSection has its own 3D entrance — no wrapper needed */}
        <HomeHeroSection />
        <ScrollReveal3D>
          <NoProfitSection />
        </ScrollReveal3D>
        <ScrollReveal3D>
          <UpcomingReleasesSection initialReleases={upcomingReleases} />
        </ScrollReveal3D>
        <ScrollReveal3D>
          <NewMusicSection initialReleases={carouselReleases} />
        </ScrollReveal3D>
        <ScrollReveal3D>
          <MeetArtistSection initialArtists={artists} />
        </ScrollReveal3D>
        <ScrollReveal3D>
          <MusicHeardSection
            heading="Let's get your music heard."
            subtext="Artist, visionary, or just someone with big ideas? We're here to listen. Let's talk. "
          />
        </ScrollReveal3D>
      </main>
      <Footer />
    </div>
  );
} 