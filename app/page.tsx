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
import { buildOrganizationJsonLd } from "@/lib/seo";
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
  const [upcomingReleases, carouselReleases, artists] = await Promise.all([
    getUpcomingReleases(),
    getCarouselReleases(),
    getHomeArtists(),
  ]);

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildOrganizationJsonLd()),
        }}
      />
      <Navbar />
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
      <Footer />
    </div>
  );
} 