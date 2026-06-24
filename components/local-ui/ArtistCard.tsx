"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
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
}

const ArtistCard: React.FC<ArtistCardProps> = ({ artist, onClick }) => {
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

  const handleSocialClick = (url: string | null | undefined, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  // Real, labelled, keyboard-operable social buttons (were bare clickable <svg>s).
  const socials: { url: string | null | undefined; Icon: typeof LuX; label: string }[] = [
    { url: artist.xLink, Icon: LuX, label: "X (Twitter)" },
    { url: artist.tiktokLink, Icon: RiTiktokFill, label: "TikTok" },
    { url: artist.youtubeLink, Icon: FaYoutube, label: "YouTube" },
    { url: artist.instagramLink, Icon: FaInstagram, label: "Instagram" },
    { url: artist.facebookLink, Icon: FaFacebookF, label: "Facebook" },
    { url: artist.spotifyLink, Icon: FaSpotify, label: "Spotify" },
    { url: artist.appleMusicLink, Icon: FaApple, label: "Apple Music" },
    { url: artist.tidalLink, Icon: SiTidal, label: "Tidal" },
    { url: artist.amazonMusicLink, Icon: SiAmazonmusic, label: "Amazon Music" },
    { url: artist.soundcloudLink, Icon: FaSoundcloud, label: "SoundCloud" },
  ];

  return (
    // Perspective wrapper — does not transform itself, just sets the 3D stage
    <div
      style={{ perspective: "800px" }}
      className="w-72 max-w-full h-84 cursor-pointer"
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
        className="w-full h-full rounded-lg flex flex-col justify-end p-6 relative overflow-hidden"
      >
        {/* Real <img> (via next/image) instead of a CSS background so the photo
            is crawlable by Google Images and carries alt text. Sits behind the
            shimmer (z-1), gradient (z-2) and content (z-3). */}
        <Image
          src={artist.profilePicture || "/meet-artist-img.svg"}
          alt={artist.name}
          fill
          sizes="288px"
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

        {/* Content */}
        <div className="relative" style={{ zIndex: 3 }}>
          <p className="text-white font-semibold">{artist.name}</p>
          <p className="text-gray-300 text-xs mt-1">
            {artist.biography.length > 100
              ? `${artist.biography.substring(0, 100)}...`
              : artist.biography}
          </p>
          <div className="h-[1px] bg-gray-600 w-full mt-2" />
          <div className="flex justify-between items-center gap-2 mt-3">
            {socials
              .filter((s) => s.url)
              .map(({ url, Icon, label }) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  onClick={(e) => handleSocialClick(url, e)}
                  className="inline-flex rounded text-white transition-colors hover:text-gray-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </button>
              ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ArtistCard;
