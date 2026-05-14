"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReleaseCardSm from "@/components/local-ui/ReleaseCardSm";
import { FaApple, FaFacebookF, FaInstagram, FaSoundcloud, FaSpotify, FaYoutube } from "react-icons/fa";
import { SiAmazonmusic, SiTidal } from "react-icons/si";
import { LuX } from "react-icons/lu";
import { RiTiktokFill } from "react-icons/ri";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
} from "@/lib/release-format";

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

interface ArtistRelease {
  id: string;
  name: string;
  kind: "SINGLE" | "EP" | "ALBUM";
  coverImage: string;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
  tracks: { id: string }[];
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
}

interface ArtistSummary {
  id: string;
  name: string;
}

export default function ArtistDetail() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.artistId as string;

  const [artist, setArtist] = useState<Artist | null>(null);
  const [allArtists, setAllArtists] = useState<ArtistSummary[]>([]);
  const [releases, setReleases] = useState<ArtistRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchArtistData();
  }, [artistId]);

  const fetchArtistData = async () => {
    try {
      const artistResponse = await fetch(`/api/artists/${artistId}`);
      if (artistResponse.ok) {
        const artistData = await artistResponse.json();
        setArtist(artistData);
      } else {
        setError(
          artistResponse.status === 404 ? "Artist not found" : "Failed to fetch artist"
        );
        return;
      }

      const [releasesResponse, artistsResponse] = await Promise.all([
        fetch(`/api/artists/${artistId}/releases`),
        fetch("/api/artists"),
      ]);

      if (artistsResponse.ok) {
        setAllArtists(await artistsResponse.json());
      }

      if (releasesResponse.ok) {
        setReleases(await releasesResponse.json());
      }
    } catch (e) {
      console.error(e);
      setError("Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialClick = (url: string | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const getArtistNames = (ids: string[] = []) =>
    ids
      .map((id) => allArtists.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name));

  const getPrimaryArtistName = (primaryArtistIds: string[] = []) => {
    const names = getArtistNames(primaryArtistIds);
    return names.length > 0 ? names.join(", ") : artist?.name || "Unknown Artist";
  };

  const getFeatureArtistNames = (
    featureArtistNames: string[] | undefined,
    featureArtistIds: string[] = [],
    primaryArtistIds: string[] = []
  ) => {
    const map = buildArtistMap(allArtists);
    return combinedFeatureDisplayNames(
      featureArtistIds,
      primaryArtistIds,
      map,
      featureArtistNames
    );
  };

  if (isLoading) {
    return (
      <div>
        <div className="min-h-screen text-white flex justify-center items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div>
        <div className="min-h-screen  text-white">
          <div className="px-[10%] py-14">
            <div className="text-center py-20">
              <p className="text-red-400 mb-4">{error || "Artist not found"}</p>
              <Button onClick={() => router.back()} variant="outline" className="border-gray-700">
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="min-h-screen  text-white">
        <div className="px-[10%] py-14">
          <div className="mb-12">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className="mb-6 text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <div className="flex items-start gap-8">
              {artist.profilePicture && (
                <img
                  src={artist.profilePicture}
                  alt={artist.name}
                  className="w-48 h-48 rounded-2xl object-cover"
                />
              )}
              <div className="flex-1">
                <h1 className="text-5xl font-light tracking-tighter mb-4">{artist.name}</h1>
                <p className="text-gray-400 text-lg mb-6 max-w-3xl">{artist.biography}</p>

                <div className="flex items-center gap-4">
                  {artist.xLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.xLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="X (Twitter)"
                    >
                      <LuX className="h-6 w-6" />
                    </button>
                  )}
                  {artist.tiktokLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.tiktokLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="TikTok"
                    >
                      <RiTiktokFill className="h-6 w-6" />
                    </button>
                  )}
                  {artist.youtubeLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.youtubeLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="YouTube"
                    >
                      <FaYoutube className="h-6 w-6" />
                    </button>
                  )}
                  {artist.instagramLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.instagramLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Instagram"
                    >
                      <FaInstagram className="h-6 w-6" />
                    </button>
                  )}
                  {artist.facebookLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.facebookLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Facebook"
                    >
                      <FaFacebookF className="h-6 w-6" />
                    </button>
                  )}
                  {artist.spotifyLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.spotifyLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Spotify"
                    >
                      <FaSpotify className="h-6 w-6" />
                    </button>
                  )}
                  {artist.appleMusicLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.appleMusicLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Apple Music"
                    >
                      <FaApple className="h-6 w-6" />
                    </button>
                  )}
                  {artist.tidalLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.tidalLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Tidal"
                    >
                      <SiTidal className="h-6 w-6" />
                    </button>
                  )}
                  {artist.amazonMusicLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.amazonMusicLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="Amazon Music"
                    >
                      <SiAmazonmusic className="h-6 w-6" />
                    </button>
                  )}
                  {artist.soundcloudLink && (
                    <button
                      onClick={(e) => handleSocialClick(artist.soundcloudLink, e)}
                      className="text-gray-400 hover:text-white transition-colors"
                      aria-label="SoundCloud"
                    >
                      <FaSoundcloud className="h-6 w-6" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {releases.length > 0 ? (
            <div className="mb-12">
              <h2 className="text-2xl font-light tracking-tighter mb-6">Releases</h2>
              <div className="flex gap-5 items-center flex-wrap">
                {releases.map((rel) => (
                  <div
                    key={rel.id}
                    onClick={() => router.push(`/releases/${rel.id}`)}
                    className="cursor-pointer w-72 h-84"
                  >
                    <ReleaseCardSm
                      release={{
                        id: rel.id,
                        name: rel.name,
                        thumbnail: rel.coverImage,
                        audio: null,
                        primaryArtistName: getPrimaryArtistName(rel.primaryArtistIds),
                        featureArtistNames: getFeatureArtistNames(
                          rel.featureArtistNames,
                          rel.featureArtistIds,
                          rel.primaryArtistIds
                        ),
                        songCount: rel.tracks?.length ?? 0,
                        kindLabel:
                          rel.kind === "ALBUM"
                            ? "Album"
                            : rel.kind === "EP"
                              ? "EP"
                              : "Single",
                        spotifyLink: rel.spotifyLink,
                        appleMusicLink: rel.appleMusicLink,
                        tidalLink: rel.tidalLink,
                        amazonMusicLink: rel.amazonMusicLink,
                        youtubeLink: rel.youtubeLink,
                        soundcloudLink: rel.soundcloudLink,
                        isrcExplicit: rel.isrcExplicit,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg">No releases yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
