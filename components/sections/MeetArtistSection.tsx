"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import IconButton from "../local-ui/IconButton";
import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { FaApple, FaFacebookF, FaInstagram, FaSoundcloud, FaSpotify, FaYoutube } from "react-icons/fa";
import { SiAmazonmusic, SiTidal } from "react-icons/si";
import { RiTiktokFill } from "react-icons/ri";
import { LuX } from "react-icons/lu";

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
  const router = useRouter();
  const [artists, setArtists] = useState<Artist[]>(initialArtists ?? []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(initialArtists === undefined);

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

  const handleViewDetails = () => {
    if (variant === "artists") {
      const a = artists[currentIndex];
      if (a?.id) router.push(`/artists/${a.id}`);
      return;
    }
    router.push("/artists");
  };

  if (isLoading) {
    return (
      <div className="bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-14 sm:py-20 md:py-28"
        style={{ backgroundImage: `url('/hero-bg.svg')` }}>
        <p className="font-light text-3xl sm:text-4xl md:text-5xl opacity-90 text-center tracking-tighter">
          Meet the Artists.
        </p>
        <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 opacity-50 font-light px-4">Our roster is filled with boundary-pushing talent. These are the voices shaping the future of music.</p>
        <div className="flex justify-center items-center mt-8 sm:mt-12 md:mt-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-14 sm:py-20 md:py-28"
        style={{ backgroundImage: `url('/hero-bg.svg')` }}>
        <p className="font-light text-3xl sm:text-4xl md:text-5xl opacity-90 text-center tracking-tighter">
          Meet the Artists.
        </p>
        <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 opacity-50 font-light px-4">Our roster is filled with boundary-pushing talent. These are the voices shaping the future of music.</p>
        <div className="flex justify-center mt-6 sm:mt-8">
          <IconButton text="See Who's Here"/>
        </div>
        <p className="text-center text-muted-foreground mt-12 sm:mt-16">No artists available yet.</p>
      </div>
    );
  }

  const currentArtist = artists[currentIndex];
  const artistNumber = String(currentIndex + 1).padStart(2, '0');

  return (
    <div className="bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-14 sm:py-20 md:py-28"
      style={{ backgroundImage: `url('/hero-bg.svg')` }}>
      <p className="font-light text-3xl sm:text-4xl md:text-5xl opacity-90 text-center tracking-tighter">
        Meet the Artists.
      </p>
      <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 opacity-50 font-light px-4">Our roster is filled with boundary-pushing talent. These are the voices shaping the future of music.</p>
      <div className="flex justify-center mt-6 sm:mt-8">
        <IconButton text="See Who's Here" onClick={() => router.push("/artists")}/>
      </div>
      <div className="mt-8 sm:mt-12 md:mt-16 flex flex-col lg:flex-row justify-between items-center gap-8 lg:gap-4 min-h-[600px] sm:min-h-[700px] md:min-h-[800px]">
        {/* Previous button - hidden on mobile, shown on desktop */}
        <div 
          className="hidden lg:flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={handlePrevious}
        >
          <ArrowLeft className="w-4 h-4"/>
          <p className="text-muted-foreground text-sm uppercase">View previous artist</p>
        </div>
        
        {/* Main content - image and info */}
        <div className="relative w-full lg:flex-1 flex justify-center">
          <div className="relative w-full max-w-[500px]">
            <div className="relative w-full aspect-[5/6] max-h-[600px]">
              <Image
                src={currentArtist.profilePicture || "/meet-artist-img.svg"}
                width={500}
                height={600}
                alt={currentArtist.name}
                className="rounded-[18px] object-cover w-full h-full"
              />
            </div>
            <div className="flex justify-center items-center gap-5 sm:gap-7 mt-4 sm:mt-5">
              {currentArtist.xLink && (
                <a href={currentArtist.xLink} target="_blank" rel="noopener noreferrer">
                  <LuX className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.tiktokLink && (
                <a href={currentArtist.tiktokLink} target="_blank" rel="noopener noreferrer">
                  <RiTiktokFill className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.youtubeLink && (
                <a href={currentArtist.youtubeLink} target="_blank" rel="noopener noreferrer">
                  <FaYoutube className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.instagramLink && (
                <a href={currentArtist.instagramLink} target="_blank" rel="noopener noreferrer">
                  <FaInstagram className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.facebookLink && (
                <a href={currentArtist.facebookLink} target="_blank" rel="noopener noreferrer">
                  <FaFacebookF className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.spotifyLink && (
                <a href={currentArtist.spotifyLink} target="_blank" rel="noopener noreferrer">
                  <FaSpotify className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.appleMusicLink && (
                <a href={currentArtist.appleMusicLink} target="_blank" rel="noopener noreferrer">
                  <FaApple className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.tidalLink && (
                <a href={currentArtist.tidalLink} target="_blank" rel="noopener noreferrer">
                  <SiTidal className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.amazonMusicLink && (
                <a href={currentArtist.amazonMusicLink} target="_blank" rel="noopener noreferrer">
                  <SiAmazonmusic className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
              {currentArtist.soundcloudLink && (
                <a href={currentArtist.soundcloudLink} target="_blank" rel="noopener noreferrer">
                  <FaSoundcloud className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground hover:text-white transition-colors cursor-pointer" />
                </a>
              )}
            </div>
            {/* Artist info - below image on mobile, to the right on desktop */}
            <div className="mt-6 lg:absolute lg:left-[105%] lg:bottom-0 lg:w-80 lg:mt-0 min-h-[200px] sm:min-h-[250px]">
              <p className="text-xs text-muted-foreground">({artistNumber})</p>
              <p className="font-light text-3xl sm:text-4xl md:text-5xl lg:text-6xl mt-1">{currentArtist.name}</p>
              <p className="text-xs sm:text-sm font-light text-muted-foreground mt-2 line-clamp-3 lg:line-clamp-4 min-h-[60px] sm:min-h-[80px]">
                {currentArtist.biography}
              </p>
              <div 
                className="mt-6 sm:mt-10 lg:mt-14 flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
                onClick={handleViewDetails}
              >
                <p className="text-xs sm:text-sm font-medium">
                  {variant === "artists" ? "View detail" : "View all artists"}
                </p>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5"/>
              </div>
            </div>
          </div>
        </div>
        
        {/* Next button - hidden on mobile, shown on desktop */}
        <div 
          className="hidden lg:flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
          onClick={handleNext}
        >
          <p className="text-muted-foreground text-sm uppercase">View next artist</p>
          <ArrowRight className="w-4 h-4"/>
        </div>
        
        {/* Mobile navigation buttons */}
        <div className="flex lg:hidden items-center justify-between w-full max-w-md mt-4">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={handlePrevious}
          >
            <ArrowLeft className="w-4 h-4"/>
            <p className="text-muted-foreground text-xs sm:text-sm uppercase">Previous</p>
          </div>
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={handleNext}
          >
            <p className="text-muted-foreground text-xs sm:text-sm uppercase">Next</p>
            <ArrowRight className="w-4 h-4"/>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetArtistSection;
