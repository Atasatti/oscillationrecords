"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReleaseCardSm from "@/components/local-ui/ReleaseCardSm";
import { FaApple, FaFacebookF, FaInstagram, FaSoundcloud, FaSpotify, FaYoutube } from "react-icons/fa";
import { SiAmazonmusic, SiTidal } from "react-icons/si";
import { LuX } from "react-icons/lu";
import { RiTiktokFill } from "react-icons/ri";
import type { ArtistDetailDTO, ReleaseCardDTO } from "@/lib/catalog-data";

type ArtistDetailViewProps = {
  artist: ArtistDetailDTO;
  releases: ReleaseCardDTO[];
};

export default function ArtistDetailView({ artist, releases }: ArtistDetailViewProps) {
  const router = useRouter();

  const handleSocialClick = (url: string | null, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

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
                        thumbnail: rel.thumbnail,
                        audio: null,
                        primaryArtistName: rel.primaryArtistName,
                        featureArtistNames: rel.featureArtistNames,
                        artist: rel.artist,
                        songCount: rel.songCount,
                        kindLabel:
                          rel.type === "album"
                            ? "Album"
                            : rel.type === "ep"
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
