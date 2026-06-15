"use client";

import React, { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  useSpring,
  useMotionTemplate,
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
    if (!cardRef.current) return;
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

  return (
    // Perspective wrapper — does not transform itself, just sets the 3D stage
    <div
      style={{ perspective: "800px" }}
      className="w-72 h-84 cursor-pointer"
      onClick={onClick}
    >
      <motion.div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
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
          backgroundImage: `url(${artist.profilePicture})`,
        }}
        className="w-full h-full rounded-lg flex flex-col justify-end bg-no-repeat bg-cover bg-center p-6 relative"
      >
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
            {artist.xLink && (
              <LuX
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.xLink, e)}
              />
            )}
            {artist.tiktokLink && (
              <RiTiktokFill
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.tiktokLink, e)}
              />
            )}
            {artist.youtubeLink && (
              <FaYoutube
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.youtubeLink, e)}
              />
            )}
            {artist.instagramLink && (
              <FaInstagram
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.instagramLink, e)}
              />
            )}
            {artist.facebookLink && (
              <FaFacebookF
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.facebookLink, e)}
              />
            )}
            {artist.spotifyLink && (
              <FaSpotify
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.spotifyLink, e)}
              />
            )}
            {artist.appleMusicLink && (
              <FaApple
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.appleMusicLink, e)}
              />
            )}
            {artist.tidalLink && (
              <SiTidal
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.tidalLink, e)}
              />
            )}
            {artist.amazonMusicLink && (
              <SiAmazonmusic
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.amazonMusicLink, e)}
              />
            )}
            {artist.soundcloudLink && (
              <FaSoundcloud
                className="h-6 w-6 text-white hover:text-gray-300 cursor-pointer"
                onClick={(e) => handleSocialClick(artist.soundcloudLink, e)}
              />
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ArtistCard;
