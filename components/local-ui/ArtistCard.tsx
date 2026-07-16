"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BLUR_DATA_URL } from "@/lib/image-blur";
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
} from "motion/react";
import {
  FaApple,
  FaFacebookF,
  FaInstagram,
  FaSoundcloud,
  FaSpotify,
  FaYoutube,
} from "react-icons/fa";
import { SiAmazonmusic, SiTidal } from "react-icons/si";
import { LuX } from "react-icons/lu";
import { RiTiktokFill } from "react-icons/ri";
import { trackLinkClick } from "@/lib/track-link-click";

interface Artist {
  id: string;
  name: string;
  biography: string;
  profilePicture?: string | null;
  xLink?: string | null;
  tiktokLink?: string | null;
  spotifyLink?: string | null;
  instagramLink?: string | null;
  youtubeLink?: string | null;
  facebookLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  soundcloudLink?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ArtistCardProps {
  artist: Artist;
  onClick?: () => void;
  /** When set, the whole card navigates here (via a transparent overlay link,
   *  kept as a SIBLING of the social buttons so no interactive control is nested
   *  inside an anchor — WCAG 4.1.2 / valid HTML). */
  href?: string;
}

const ArtistCard: React.FC<ArtistCardProps> = ({ artist, onClick, href }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  // When the user prefers reduced motion, the JS-driven tilt/shimmer/scale are
  // skipped (the global CSS reduced-motion block only stops CSS animations).
  const reduced = useReducedMotion();

  // 0–1 range; 0.5 = cursor at center = no tilt
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const rawRotateX = useTransform(mouseY, [0, 1], [10, -10]);
  const rawRotateY = useTransform(mouseX, [0, 1], [-10, 10]);
  const rotateX = useSpring(rawRotateX, { stiffness: 300, damping: 30 });
  const rotateY = useSpring(rawRotateY, { stiffness: 300, damping: 30 });

  // Directional shadow — shifts opposite the tilt (light source stays fixed above)
  const shadowX = useTransform(rotateY, [-10, 10], [-16, 16]);
  const shadowY = useTransform(rotateX, [-10, 10], [16, -16]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 40px rgba(0,0,0,0.65)`;

  // Gloss shimmer — radial highlight that follows the cursor
  const shimmerX = useTransform(mouseX, [0, 1], [0, 100]);
  const shimmerY = useTransform(mouseY, [0, 1], [0, 100]);
  const shimmerBg = useMotionTemplate`radial-gradient(circle at ${shimmerX}% ${shimmerY}%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 40%, transparent 68%)`;

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

  const handleSocialClick = (
    url: string | null | undefined,
    linkType: string,
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (!url) return;
    // Record the outbound click for click-through analytics (same as release
    // streaming links + the artist detail page).
    trackLinkClick("artist", artist.id, linkType, artist.name);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Real, labelled, keyboard-operable social buttons (were bare clickable <svg>s).
  // `type` is the analytics linkType recorded on click.
  const socials: { url: string | null | undefined; Icon: typeof LuX; label: string; type: string }[] = [
    { url: artist.xLink, Icon: LuX, label: "X (Twitter)", type: "x" },
    { url: artist.tiktokLink, Icon: RiTiktokFill, label: "TikTok", type: "tiktok" },
    { url: artist.youtubeLink, Icon: FaYoutube, label: "YouTube", type: "youtube" },
    { url: artist.instagramLink, Icon: FaInstagram, label: "Instagram", type: "instagram" },
    { url: artist.facebookLink, Icon: FaFacebookF, label: "Facebook", type: "facebook" },
    { url: artist.spotifyLink, Icon: FaSpotify, label: "Spotify", type: "spotify" },
    { url: artist.appleMusicLink, Icon: FaApple, label: "Apple Music", type: "appleMusic" },
    { url: artist.tidalLink, Icon: SiTidal, label: "Tidal", type: "tidal" },
    { url: artist.amazonMusicLink, Icon: SiAmazonmusic, label: "Amazon Music", type: "amazonMusic" },
    { url: artist.soundcloudLink, Icon: FaSoundcloud, label: "SoundCloud", type: "soundcloud" },
  ];

  return (
    // Perspective wrapper — does not transform itself, just sets the 3D stage
    <div
      style={{ perspective: "800px" }}
      className="h-84 w-full cursor-pointer"
      onClick={onClick}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => !reduced && setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        animate={{
          z: isHovered ? 20 : 0,
          scale: isHovered ? 1.02 : 1,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{
          rotateX,
          rotateY,
          boxShadow,
          transformStyle: "preserve-3d",
        }}
        className="w-full h-full rounded-lg flex flex-col justify-end p-4 sm:p-6 relative overflow-hidden"
      >
        {/* Real <img> (via next/image) instead of a CSS background so the photo
            is crawlable by Google Images and carries alt text. Sits behind the
            shimmer (z-1), gradient (z-2) and content (z-3). */}
        <Image
          src={artist.profilePicture || "/meet-artist-img.svg"}
          alt={artist.name}
          fill
          sizes="288px"
          placeholder="blur"
          blurDataURL={BLUR_DATA_URL}
          className="object-cover rounded-lg"
          style={{ zIndex: 0 }}
        />

        {/* Moving gloss shimmer — follows cursor like real light on a photo */}
        <motion.div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{ background: shimmerBg, zIndex: 1 }}
        />

        {/* Gradient overlay for text legibility */}
        <div
          className="absolute inset-0 rounded-lg"
          style={{
            background:
              "linear-gradient(to top, black 0%, rgba(0,0,0,0.6) 30%, transparent 40%)",
            zIndex: 2,
          }}
        />

        {/* Whole-card navigation overlay (z-3, above the art). The content layer
            above is pointer-events-none, so clicking the card — name, bio, empty
            space — activates THIS link; the social buttons below re-enable pointer
            events, so they stay clickable SIBLINGS, never nested inside an anchor
            (fixes the invalid <a><button> nesting + the 11-tab-stops-per-card). */}
        {href ? (
          <Link
            href={href}
            aria-label={artist.name}
            className="absolute inset-0 z-[3] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          />
        ) : null}

        {/* Content */}
        <div className="relative pointer-events-none" style={{ zIndex: 4 }}>
          <p className="text-white font-semibold text-sm sm:text-base">{artist.name}</p>
          {/* Bio hidden on the small 2-up mobile cards (it overlapped the photo and
              read as clutter); shown from sm up where there's room. */}
          <p className="hidden sm:block text-gray-300 text-xs mt-1">
            {artist.biography.length > 100
              ? `${artist.biography.substring(0, 100)}...`
              : artist.biography}
          </p>
          <div className="h-[1px] bg-gray-600 w-full mt-2" />
          {/* Icons wrap and shrink on mobile so a long social list can't overflow
              the narrow card; the original nowrap/justify-between returns at sm. */}
          <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 sm:mt-3 sm:flex-nowrap sm:justify-between sm:gap-2">
            {socials
              .filter((s) => s.url)
              .map(({ url, Icon, label, type }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  onClick={(e) => handleSocialClick(url, type, e)}
                  className="inline-flex min-h-6 min-w-6 items-center justify-center rounded text-white transition-colors hover:text-gray-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <Icon className="h-[18px] w-[18px] sm:h-6 sm:w-6" aria-hidden />
                </button>
              ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ArtistCard;
