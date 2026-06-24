"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import ReleaseCardSm from "../local-ui/ReleaseCardSm";
import { Skeleton } from "@/components/ui/skeleton";
import { slugify } from "@/lib/slug";

interface Release {
  id: string;
  name: string;
  thumbnail?: string | null;
  audio?: string | null;
  type: 'single' | 'album' | 'ep';
  /** Primary artist(s) display name */
  primaryArtistName?: string;
  /** Resolved feature artist names (same order as API) */
  featureArtistNames?: string[];
  /** Combined "Primary ft A, B" for backwards compatibility / player */
  artist: string;
  artistId: string;
  releaseDate: string | null;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
  createdAt: string;
  year: string;
  songCount: number;
}

type ReleasesSectionProps = {
  /** Server-rendered releases. When provided, the section renders from the
   * initial HTML and skips the client fetch (no spinner / hydration waterfall). */
  initialReleases?: Release[];
};

const ReleasesSection = ({ initialReleases }: ReleasesSectionProps) => {
  const router = useRouter();
  const [releases, setReleases] = useState<Release[]>(initialReleases ?? []);
  const [isLoading, setIsLoading] = useState(initialReleases === undefined);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");

  const handleReleaseClick = (release: Release) => {
    router.push(`/releases/${slugify(release.name)}`);
  };

  useEffect(() => {
    // Data already in the HTML from the server — don't refetch on mount.
    if (initialReleases !== undefined) return;
    fetchReleases();
  }, [initialReleases]);

  const fetchReleases = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/releases");
      if (response.ok) {
        const data = await response.json();
        setReleases(data);
      } else {
        setError("Failed to load releases");
      }
    } catch (error) {
      console.error("Error fetching releases:", error);
      setError("Failed to load releases");
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique years from releases and sort them
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    releases.forEach(release => {
      if (release.year) {
        years.add(release.year);
      }
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [releases]);

  // Filter releases by selected year
  const filteredReleases = useMemo(() => {
    if (selectedFilter === "All") {
      return releases;
    }
    return releases.filter(release => release.year === selectedFilter);
  }, [releases, selectedFilter]);

  // Combine "All" with available years for filters
  const dateFilters = ["All", ...availableYears];

  if (isLoading) {
    return (
      <div className="px-[10%] w-full mx-auto py-14">
        <p className="text-xs uppercase tracking-wider text-center text-muted-foreground">
          All releases
        </p>
        <div className="flex gap-5 items-center flex-wrap mt-14 justify-center sm:justify-start">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="w-72 max-w-full h-84 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-[10%] w-full mx-auto py-14">
        <p className="text-xs uppercase tracking-wider text-center text-muted-foreground">
          All releases
        </p>
        <div className="text-center py-20">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={fetchReleases}
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-[10%] w-full mx-auto py-14">
      <p className="text-xs uppercase tracking-wider text-center text-muted-foreground">
        All releases
      </p>
      <p className="font-light text-5xl text-center tracking-tighter mt-3">
        {filteredReleases.length} {filteredReleases.length === 1 ? 'Release' : 'Releases'}
      </p>
      <div className="flex gap-6 md:gap-8 mt-8 justify-center flex-wrap">
        {dateFilters.map((filter) => (
          <button
            key={filter}
            onClick={() => setSelectedFilter(filter)}
            className={`text-sm font-medium transition-colors duration-200 cursor-pointer ${
              selectedFilter === filter 
                ? "text-white" 
                : "text-muted-foreground hover:text-white"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {filteredReleases.length === 0 ? (
        <p className="text-center text-muted-foreground mt-14">No releases found for the selected year.</p>
      ) : (
        <div className="flex gap-5 items-center flex-wrap mt-14">
          {filteredReleases.map((release) => (
            <div
              key={release.id}
              onClick={() => handleReleaseClick(release)}
              className="cursor-pointer relative group w-72 max-w-full h-84"
            >

              <ReleaseCardSm
                href={`/releases/${slugify(release.name)}`}
                release={{
                  id: release.id,
                  name: release.name,
                  thumbnail: release.thumbnail,
                  audio: release.audio,
                  primaryArtistName: release.primaryArtistName,
                  featureArtistNames: release.featureArtistNames,
                  artist: release.artist,
                  songCount: release.songCount,
                  kindLabel:
                    release.type === "album"
                      ? "Album"
                      : release.type === "ep"
                        ? "EP"
                        : "Single",
                  spotifyLink: release.spotifyLink,
                  appleMusicLink: release.appleMusicLink,
                  tidalLink: release.tidalLink,
                  amazonMusicLink: release.amazonMusicLink,
                  youtubeLink: release.youtubeLink,
                  soundcloudLink: release.soundcloudLink,
                  isrcExplicit: release.isrcExplicit,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReleasesSection;
