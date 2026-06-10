"use client";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ArtistCard from "../local-ui/ArtistCard";

interface Artist {
  id: string;
  name: string;
  biography: string;
  profilePicture?: string;
  xLink?: string;
  tiktokLink?: string;
  spotifyLink?: string;
  instagramLink?: string;
  youtubeLink?: string;
  facebookLink?: string;
  appleMusicLink?: string;
  tidalLink?: string;
  amazonMusicLink?: string;
  soundcloudLink?: string;
  createdAt: string;
  updatedAt: string;
}

const ArtistsSection = () => {
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArtists();
  }, []);

  const fetchArtists = async () => {
    try {
      const response = await fetch("/api/artists?public=1");
      if (response.ok) {
        const data = await response.json();
        setArtists(data);
      } else {
        setError("Failed to fetch artists");
      }
    } catch (error) {
      console.error("Error fetching artists:", error);
      setError("Failed to fetch artists");
    } finally {
      setIsLoading(false);
    }
  };

  // Build year filters from actual artist `createdAt` values.
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    artists.forEach((artist) => {
      if (!artist.createdAt) return;
      const d = new Date(artist.createdAt);
      if (Number.isNaN(d.getTime())) return;
      years.add(d.getFullYear().toString());
    });
    return Array.from(years).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
  }, [artists]);

  const dateFilters = useMemo(() => ["All", ...availableYears], [availableYears]);

  // Filter artists by year (based on `createdAt`)
  const filteredArtists = artists.filter(artist => {
    if (selectedFilter === "All") return true;
    if (!artist.createdAt) return false;
    const d = new Date(artist.createdAt);
    if (Number.isNaN(d.getTime())) return false;
    const year = d.getFullYear().toString();
    return year === selectedFilter;
  });

  return (
    <div className=" px-[10%] w-full mx-auto py-14">
      <p className="text-xs uppercase tracking-wider text-center text-muted-foreground">
        All Artists
      </p>
      <p className="font-light text-5xl text-center tracking-tighter mt-3">
        {isLoading ? "Loading..." : `${filteredArtists.length} Artists`}
      </p>
      <div className="flex gap-6 md:gap-8 mt-8">
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

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      ) : error ? (
        <div className="text-center py-20">
          <p className="text-red-400 mb-4">{error}</p>
          <button 
            onClick={fetchArtists} 
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
          >
            Try Again
          </button>
        </div>
      ) : filteredArtists.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-lg">No artists found</p>
          <p className="text-gray-500">Check back later for new releases</p>
        </div>
      ) : (
        <div className="flex gap-5 items-center flex-wrap mt-14">
          {filteredArtists.map((artist) => (
            <Link key={artist.id} href={`/artists/${artist.id}`}>
              <ArtistCard artist={artist} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArtistsSection;
