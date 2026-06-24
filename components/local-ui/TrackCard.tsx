"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Play } from "lucide-react";
import { useMusic } from "@/contexts/music-context";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import StreamingLinks from "./StreamingLinks";
import ExplicitBadge from "./ExplicitBadge";
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
} from "motion/react";

export interface TrackCardTrack {
  id: string | number;
  title: string;
  artist: string;
  primaryArtistName?: string;
  featureArtistNames?: string[];
  duration: string;
  backgroundImage: string;
  avatar?: string;
  audio?: string | null;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
  releaseType?: string;
}

const TrackCard: React.FC<{ track: TrackCardTrack }> = ({ track }) => {
  const { playSong } = useMusic();
  const { data: session, status } = useSession();
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  // Skip the JS-driven tilt/shimmer/scale for reduced-motion users.
  const reduced = useReducedMotion();

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rawRotateX = useTransform(mouseY, [0, 1], [8, -8]);
  const rawRotateY = useTransform(mouseX, [0, 1], [-8, 8]);
  const rotateX = useSpring(rawRotateX, { stiffness: 300, damping: 30 });
  const rotateY = useSpring(rawRotateY, { stiffness: 300, damping: 30 });

  const shadowX = useTransform(rotateY, [-8, 8], [-14, 14]);
  const shadowY = useTransform(rotateX, [-8, 8], [14, -14]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 40px rgba(0,0,0,0.7)`;

  const shimmerX = useTransform(mouseX, [0, 1], [0, 100]);
  const shimmerY = useTransform(mouseY, [0, 1], [0, 100]);
  const shimmerBg = useMotionTemplate`radial-gradient(circle at ${shimmerX}% ${shimmerY}%, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.05) 40%, transparent 68%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduced || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
    setIsHovered(false);
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === "unauthenticated" || !session) {
      router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (track.audio) {
      playSong({
        id: String(track.id),
        title: track.title,
        artist:
          track.artist ||
          (track.primaryArtistName
            ? track.featureArtistNames?.length
              ? `${track.primaryArtistName} ft ${track.featureArtistNames.join(", ")}`
              : track.primaryArtistName
            : "Unknown Artist"),
        image: track.backgroundImage,
        audio: track.audio,
        isExplicit: Boolean(track.isrcExplicit),
        releaseType: track.releaseType,
      });
    }
  };

  return (
    /* Perspective wrapper — no overflow-hidden so the 3D tilt isn't clipped */
    <div style={{ perspective: "800px" }} className="flex-shrink-0 w-84 h-100">
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => !reduced && setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        animate={{ z: isHovered ? 18 : 0, scale: isHovered ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{ rotateX, rotateY, boxShadow, transformStyle: "preserve-3d" }}
        className="relative w-full h-full rounded-2xl cursor-pointer group"
      >
        {/* Artwork — next/image (resized + WebP + cached) instead of a full-res
            CSS background. */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          <Image
            src={track.backgroundImage}
            alt={track.title}
            fill
            sizes="336px"
            className="object-cover"
          />
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Play button */}
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

        {/* Gloss shimmer */}
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none z-20"
          style={{ background: shimmerBg }}
        />

        {/* Track info */}
        <div className="absolute inset-0 p-4 flex flex-col justify-end z-10">
          <div className="text-white">
            <Image
              src={track.avatar || "/placeholder.svg"}
              alt={track.artist}
              width={32}
              height={32}
              className="w-8 h-8 rounded-md"
            />
            <h3 className="text-lg font-medium mb-1 mt-1 flex items-center gap-2 flex-wrap">
              <span className="line-clamp-2 min-w-0 flex-1">{track.title}</span>
              {track.isrcExplicit ? <ExplicitBadge size="sm" /> : null}
            </h3>
            {track.primaryArtistName ? (
              <>
                <p className="text-xs text-white/90 line-clamp-2">{track.primaryArtistName}</p>
                {track.featureArtistNames && track.featureArtistNames.length > 0 && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    ft {track.featureArtistNames.join(", ")}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground line-clamp-2">{track.artist}</p>
            )}
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span>{track.duration}</span>
            </div>
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
              contextName={track.title}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default TrackCard;
