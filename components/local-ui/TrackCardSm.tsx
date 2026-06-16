"use client";
import React from "react";
import { Play } from "lucide-react";
import { useMusic } from "@/contexts/music-context";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StreamingLinks from "./StreamingLinks";
import ExplicitBadge from "./ExplicitBadge";

/** Compact playable track card (admin lists, dense layouts). */
export interface TrackCardSmTrack {
  id: number | string;
  name: string;
  thumbnail?: string | null;
  audio?: string | null;
  artist?: string;
  primaryArtistName?: string;
  featureArtistNames?: string[];
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
  releaseType?: string;
}

const TrackCardSm: React.FC<{ track: TrackCardSmTrack }> = ({ track }) => {
  const { playSong } = useMusic();
  const { data: session, status } = useSession();
  const router = useRouter();

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();

    if (status === "unauthenticated" || !session) {
      const currentPath = window.location.pathname;
      router.push(`/login?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    if (track.audio) {
      playSong({
        id: String(track.id),
        title: track.name,
        artist:
          track.artist ||
          (track.primaryArtistName
            ? track.featureArtistNames?.length
              ? `${track.primaryArtistName} ft ${track.featureArtistNames.join(", ")}`
              : track.primaryArtistName
            : "Unknown Artist"),
        image: track.thumbnail || null,
        audio: track.audio,
        isExplicit: Boolean(track.isrcExplicit),
        releaseType: track.releaseType,
      });
    }
  };

  return (
    <div
      className="relative rounded-2xl overflow-hidden group cursor-pointer w-full h-full"
      title={track.name}
    >
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
        style={{
          backgroundImage: `url(${track.thumbnail || "/new-music-img1.svg"})`,
        }}
      />

      <div className="absolute left-0 right-0 top-0 bottom-16 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {track.audio && (
        <div className="absolute left-0 right-0 top-0 bottom-16 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
          <button
            onClick={handlePlay}
            className="h-16 w-16 rounded-full bg-[#dc2626] hover:bg-[#ef4444] active:bg-[#991b1b] flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-[0_0_20px_rgba(220,38,38,0.4)] active:scale-95"
            aria-label="Play track"
          >
            <Play className="w-6 h-6 text-white fill-white ml-1" />
          </button>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <div className="absolute inset-0 p-4 flex flex-col justify-end z-0">
        <div className="text-white">
          <h3 className="text-lg font-medium mb-1 mt-1 flex items-center gap-2 flex-wrap">
            <span className="line-clamp-2 min-w-0 flex-1">{track.name}</span>
            {track.isrcExplicit ? <ExplicitBadge size="sm" /> : null}
          </h3>
          {track.primaryArtistName != null && track.primaryArtistName !== "" ? (
            <>
              <p className="text-xs text-white/90 line-clamp-2">
                {track.primaryArtistName}
              </p>
              {track.featureArtistNames && track.featureArtistNames.length > 0 ? (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  ft {track.featureArtistNames.join(", ")}
                </p>
              ) : null}
            </>
          ) : track.artist ? (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {track.artist}
            </p>
          ) : null}
          <StreamingLinks
            spotifyLink={track.spotifyLink}
            appleMusicLink={track.appleMusicLink}
            tidalLink={track.tidalLink}
            amazonMusicLink={track.amazonMusicLink}
            youtubeLink={track.youtubeLink}
            soundcloudLink={track.soundcloudLink}
            className="mt-2"
            context="track"
            contextId={String(track.id)}
            contextName={track.name}
          />
        </div>
      </div>
    </div>
  );
};

export default TrackCardSm;
