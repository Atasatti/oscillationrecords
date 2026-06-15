import ArtistsSection from "@/components/sections/ArtistsSection";
import MeetArtistSection from "@/components/sections/MeetArtistSection";
import MusicHeardSection from "@/components/sections/MusicHeardSection";
import ScrollReveal3D from "@/components/local-ui/ScrollReveal3D";
import { getPublicArtists } from "@/lib/catalog-data";
import React from "react";

// ISR: keep the roster fresh and CDN-cacheable (matches the API's s-maxage=60).
export const revalidate = 60;

const Artists = async () => {
  // Fetch once on the server and share with both sections — ships in the initial
  // HTML, no client hydrate-then-fetch waterfall or loading spinners.
  const artists = await getPublicArtists();

  return (
    <div>
      <ScrollReveal3D>
        <MeetArtistSection variant="artists" initialArtists={artists} />
      </ScrollReveal3D>
      <ScrollReveal3D>
        <ArtistsSection initialArtists={artists} />
      </ScrollReveal3D>
      <ScrollReveal3D>
        <MusicHeardSection
          heading="Let’s get your music heard."
          subtext="Artist, visionary, or just someone with big ideas? We’re here to listen. Let’s talk."
        />
      </ScrollReveal3D>
    </div>
  );
};

export default Artists;
