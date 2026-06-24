"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

export interface ReleaseCardSmRelease {
  id: number | string;
  name: string;
  thumbnail?: string | null;
  audio?: string | null;
  primaryArtistName?: string;
  featureArtistNames?: string[];
  artist?: string;
  songCount?: number;
  kindLabel?: string;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
}

const ReleaseCardSm: React.FC<{ release: ReleaseCardSmRelease; href?: string }> = ({
  release,
  href,
}) => {
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

  return (
    /* Perspective wrapper — w-full h-full preserves parent-driven sizing */
    <div style={{ perspective: "800px" }} className="w-full h-full">
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => !reduced && setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        animate={{ z: isHovered ? 18 : 0, scale: isHovered ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{ rotateX, rotateY, boxShadow, transformStyle: "preserve-3d" }}
        className="relative w-full h-full rounded-2xl cursor-pointer"
        title={release.name}
      >
        {/* Artwork — next/image (auto-resized to display size + WebP + cached)
            instead of a full-res CSS background, which was shipping multi-MB
            originals on the homepage. */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden">
          <Image
            src={release.thumbnail || "/new-music-img1.svg"}
            alt={release.name}
            fill
            sizes="288px"
            className="object-cover"
          />
        </div>

        {/* Kind badge */}
        <div className="absolute left-3 top-3 z-20 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
          {release.kindLabel ?? "Release"}
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        {/* Gloss shimmer */}
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none z-20"
          style={{ background: shimmerBg }}
        />

        {/* Release info */}
        <div className="absolute inset-0 p-4 flex flex-col justify-end z-10">
          <div className="text-white">
            <h3 className="text-lg font-medium mb-1 mt-1 flex items-center gap-2 flex-wrap">
              {href ? (
                // Real link = keyboard-focusable, screen-reader-announced and
                // crawlable navigation, without nesting interactive elements
                // (the streaming buttons stay siblings). stopPropagation avoids
                // a duplicate navigation from the parent's mouse onClick.
                <Link
                  href={href}
                  onClick={(e) => e.stopPropagation()}
                  className="line-clamp-2 min-w-0 flex-1 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {release.name}
                </Link>
              ) : (
                <span className="line-clamp-2 min-w-0 flex-1">{release.name}</span>
              )}
              {release.isrcExplicit ? <ExplicitBadge size="sm" /> : null}
            </h3>
            {release.primaryArtistName ? (
              <>
                <p className="text-xs text-white/90 line-clamp-2">{release.primaryArtistName}</p>
                {release.featureArtistNames && release.featureArtistNames.length > 0 && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    ft {release.featureArtistNames.join(", ")}
                  </p>
                )}
              </>
            ) : release.artist ? (
              <p className="text-xs text-muted-foreground line-clamp-2">{release.artist}</p>
            ) : null}
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              {release.songCount !== undefined && (
                <span>{release.songCount} {release.songCount === 1 ? "Track" : "Tracks"}</span>
              )}
            </div>
            <StreamingLinks
              spotifyLink={release.spotifyLink}
              appleMusicLink={release.appleMusicLink}
              tidalLink={release.tidalLink}
              amazonMusicLink={release.amazonMusicLink}
              youtubeLink={release.youtubeLink}
              soundcloudLink={release.soundcloudLink}
              className="mt-2"
              context="release"
              contextId={String(release.id)}
              contextName={release.name}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ReleaseCardSm;
