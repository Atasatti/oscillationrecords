"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import IconButton from "../local-ui/IconButton";
import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { BLUR_DATA_URL } from "@/lib/image-blur";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { FaApple, FaFacebookF, FaInstagram, FaSoundcloud, FaSpotify, FaYoutube } from "react-icons/fa";
import { SiAmazonmusic, SiTidal } from "react-icons/si";
import { RiTiktokFill } from "react-icons/ri";
import { LuX } from "react-icons/lu";
import { usePageMedia } from "@/hooks/use-page-media";
import { slugify } from "@/lib/slug";
import { trackLinkClick } from "@/lib/track-link-click";

interface Artist {
  id: string;
  name: string;
  biography: string;
  profilePicture: string | null;
  xLink: string | null;
  tiktokLink: string | null;
  spotifyLink: string | null;
  instagramLink: string | null;
  youtubeLink: string | null;
  facebookLink: string | null;
  appleMusicLink: string | null;
  tidalLink: string | null;
  amazonMusicLink: string | null;
  soundcloudLink: string | null;
}

/** `home`: CTA goes to the artists listing. `artists`: CTA goes to the currently shown artist’s page. */
export type MeetArtistSectionVariant = "home" | "artists";

type MeetArtistSectionProps = {
  variant?: MeetArtistSectionVariant;
  /** Server-rendered artists. When provided, the section renders from the
   * initial HTML and skips the client fetch (no spinner / hydration waterfall). */
  initialArtists?: Artist[];
};

const MeetArtistSection = ({
  variant = "home",
  initialArtists,
}: MeetArtistSectionProps) => {
  const { bgHero } = usePageMedia();
  const [artists, setArtists] = useState<Artist[]>(initialArtists ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(initialArtists === undefined);

  // "Meet the Artists." is the page's primary heading on /artists (so it's the
  // <h1>); on the homepage the page <h1> lives in the hero, so here it's an <h2>.
  const HeadingTag = variant === "artists" ? "h1" : "h2";

  // Keep the carousel index in range when the artist list changes (e.g. a client
  // refetch returns fewer artists) — otherwise artists[currentIndex] is undefined
  // and the spotlight crashes on .name / .profilePicture.
  useEffect(() => {
    setCurrentIndex((i) => (artists.length === 0 ? 0 : Math.min(i, artists.length - 1)));
  }, [artists.length]);

  useEffect(() => {
    // Data already in the HTML from the server — don't refetch on mount.
    if (initialArtists !== undefined) return;
    fetchArtists();
  }, [initialArtists]);

  const fetchArtists = async () => {
    try {
      const response = await fetch("/api/artists?public=1");
      if (response.ok) {
        const data = await response.json();
        setArtists(data);
      }
    } catch (error) {
      console.error("Error fetching artists:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevious = () => {
    if (artists.length === 0) return;
    setCurrentIndex((prev) => (prev === 0 ? artists.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (artists.length === 0) return;
    setCurrentIndex((prev) => (prev === artists.length - 1 ? 0 : prev + 1));
  };

  if (isLoading) {
    return (
      <div className="bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-14 sm:py-20 md:py-28"
        style={{ backgroundImage: `url('${bgHero}')` }}>
        <HeadingTag className="font-light text-3xl sm:text-4xl md:text-5xl text-center tracking-tighter">
          Meet the Artists.
        </HeadingTag>
        <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 font-light px-4">Our roster is filled with boundary-pushing talent. These are the voices shaping the future of music.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-8 sm:mt-8 lg:flex-row lg:gap-12" aria-hidden>
          <Skeleton className="aspect-[5/6] max-h-[456px] w-full max-w-[380px] rounded-2xl" />
          <div className="flex w-full max-w-[400px] flex-col gap-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-3 h-10 w-40 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-14 sm:py-20 md:py-28"
        style={{ backgroundImage: `url('${bgHero}')` }}>
        <HeadingTag className="font-light text-3xl sm:text-4xl md:text-5xl text-center tracking-tighter">
          Meet the Artists.
        </HeadingTag>
        <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 font-light px-4">Our roster is filled with boundary-pushing talent. These are the voices shaping the future of music.</p>
        <div className="flex justify-center mt-6 sm:mt-8">
          <IconButton text="See Who's Here" href="/artists"/>
        </div>
        <p className="text-center text-muted-foreground mt-12 sm:mt-16">No artists available yet.</p>
      </div>
    );
  }

  const currentArtist = artists[currentIndex];
  if (!currentArtist) return null;
  // Real, crawlable links so the homepage/roster passes link-equity straight to
  // each artist page (with the artist name as anchor text) instead of a JS-only
  // router.push that search engines can't follow.
  const artistHref = `/artists/${slugify(currentArtist.name)}`;
  const ctaHref = variant === "artists" ? artistHref : "/artists";
  const artistNumber = String(currentIndex + 1).padStart(2, '0');

  return (
    <div className="bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-8 sm:py-10 md:py-12"
      style={{ backgroundImage: `url('${bgHero}')` }}>
      <HeadingTag className="font-light text-3xl sm:text-4xl md:text-5xl text-center tracking-tighter">
        Meet the Artists.
      </HeadingTag>
      <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 font-light px-4">Our roster is filled with boundary-pushing talent. These are the voices shaping the future of music.</p>
      <div className="flex justify-center mt-5 sm:mt-6">
        <IconButton text="See Who's Here" href="/artists"/>
      </div>
      {/* Side-by-side (image + info + side arrows) only from xl up. At lg (iPad
          portrait = 1024px) there isn't room for it inside the 10% padding, so it
          used to overflow horizontally and make the whole page scroll sideways —
          below xl we keep the stacked layout with the prev/next row underneath. */}
      <div className="mt-6 sm:mt-8 flex flex-col xl:flex-row justify-between items-center gap-6 xl:gap-6">
        {/* Previous button - hidden on mobile, shown on desktop */}
        <button
          type="button"
          className="hidden xl:flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          onClick={handlePrevious}
          aria-label="View previous artist"
        >
          <ArrowLeft className="w-4 h-4"/>
          <span className="text-muted-foreground text-sm uppercase">View previous artist</span>
        </button>
        
        {/* Main content - image + info side by side, centered as one group */}
        <div className="w-full xl:flex-1 flex flex-col xl:flex-row items-center justify-center gap-8 xl:gap-12">
          <div className="w-full max-w-[260px] sm:max-w-[320px] xl:max-w-[380px] xl:flex-shrink-0">
            <Link href={artistHref} className="relative block w-full aspect-[4/5] sm:aspect-[5/6] max-h-[456px]">
              <Image
                src={currentArtist.profilePicture || "/meet-artist-img.svg"}
                width={500}
                height={600}
                alt={currentArtist.name}
                placeholder="blur"
                blurDataURL={BLUR_DATA_URL}
                className="rounded-[18px] object-cover w-full h-full"
              />
            </Link>
            <div className="flex justify-center items-center gap-5 sm:gap-7 mt-4 sm:mt-5">
              {[
                { url: currentArtist.xLink, Icon: LuX, label: "X (Twitter)", type: "x" },
                { url: currentArtist.tiktokLink, Icon: RiTiktokFill, label: "TikTok", type: "tiktok" },
                { url: currentArtist.youtubeLink, Icon: FaYoutube, label: "YouTube", type: "youtube" },
                { url: currentArtist.instagramLink, Icon: FaInstagram, label: "Instagram", type: "instagram" },
                { url: currentArtist.facebookLink, Icon: FaFacebookF, label: "Facebook", type: "facebook" },
                { url: currentArtist.spotifyLink, Icon: FaSpotify, label: "Spotify", type: "spotify" },
                { url: currentArtist.appleMusicLink, Icon: FaApple, label: "Apple Music", type: "appleMusic" },
                { url: currentArtist.tidalLink, Icon: SiTidal, label: "Tidal", type: "tidal" },
                { url: currentArtist.amazonMusicLink, Icon: SiAmazonmusic, label: "Amazon Music", type: "amazonMusic" },
                { url: currentArtist.soundcloudLink, Icon: FaSoundcloud, label: "SoundCloud", type: "soundcloud" },
              ]
                .filter((s) => s.url)
                .map(({ url, Icon, label, type }) => (
                  <a
                    key={label}
                    href={url as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${currentArtist.name} on ${label}`}
                    // Record the outbound click for click-through analytics (same as
                    // release streaming links). Fire-and-forget beacon; default
                    // navigation still opens the link in a new tab.
                    onClick={() => trackLinkClick("artist", currentArtist.id, type, currentArtist.name)}
                  >
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" aria-hidden />
                  </a>
                ))}
            </div>
          </div>
          {/* Artist info - below image on mobile, beside it on desktop */}
          <div className="w-full max-w-[380px] xl:max-w-none xl:w-80 xl:flex-shrink-0">
              <p className="text-xs text-muted-foreground">({artistNumber})</p>
              <Link href={artistHref} className="block hover:opacity-80 transition-opacity">
                <p className="font-light text-2xl sm:text-4xl md:text-5xl xl:text-6xl mt-1 break-words">{currentArtist.name}</p>
              </Link>
              <p className="text-xs sm:text-sm font-light text-muted-foreground mt-2 line-clamp-3 xl:line-clamp-4 min-h-[54px] sm:min-h-[80px]">
                {currentArtist.biography}
              </p>
              <Link
                href={ctaHref}
                className="mt-5 sm:mt-6 xl:mt-8 flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
              >
                <p className="text-xs sm:text-sm font-medium">
                  {variant === "artists" ? "View detail" : "View all artists"}
                </p>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5"/>
              </Link>
            </div>
        </div>

        {/* Next button - hidden on mobile, shown on desktop */}
        <button
          type="button"
          className="hidden xl:flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          onClick={handleNext}
          aria-label="View next artist"
        >
          <span className="text-muted-foreground text-sm uppercase">View next artist</span>
          <ArrowRight className="w-4 h-4"/>
        </button>
        
        {/* Prev/next row — shown below xl (mobile + tablet), where the layout is
            stacked; from xl up the side arrows take over. */}
        <div className="flex xl:hidden items-center justify-between w-full max-w-md mt-4">
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            onClick={handlePrevious}
            aria-label="Previous artist"
          >
            <ArrowLeft className="w-4 h-4"/>
            <span className="text-muted-foreground text-xs sm:text-sm uppercase">Previous</span>
          </button>
          <button
            type="button"
            className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            onClick={handleNext}
            aria-label="Next artist"
          >
            <span className="text-muted-foreground text-xs sm:text-sm uppercase">Next</span>
            <ArrowRight className="w-4 h-4"/>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MeetArtistSection;
