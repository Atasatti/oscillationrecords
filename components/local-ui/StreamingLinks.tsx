"use client";
import React from "react";
import { FaSpotify, FaApple } from "react-icons/fa";
import { SiTidal, SiAmazonmusic } from "react-icons/si";
import { FaYoutube, FaSoundcloud } from "react-icons/fa";
import { trackLinkClick, type LinkContext } from "@/lib/track-link-click";

export type StreamingLinksFields = {
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
};

interface StreamingLinksProps extends StreamingLinksFields {
  className?: string;
  /** Default `sm` (16px). `md` is 20px — good for release detail headers. */
  size?: "sm" | "md";
  /** When provided, clicks are recorded for click-through analytics. */
  context?: LinkContext;
  contextId?: string;
  contextName?: string;
}

export function hasStreamingLinks({
  spotifyLink,
  appleMusicLink,
  tidalLink,
  amazonMusicLink,
  youtubeLink,
  soundcloudLink,
}: StreamingLinksFields): boolean {
  return Boolean(
    spotifyLink ||
      appleMusicLink ||
      tidalLink ||
      amazonMusicLink ||
      youtubeLink ||
      soundcloudLink
  );
}

const StreamingLinks: React.FC<StreamingLinksProps> = ({
  spotifyLink,
  appleMusicLink,
  tidalLink,
  amazonMusicLink,
  youtubeLink,
  soundcloudLink,
  className = "",
  size = "sm",
  context,
  contextId,
  contextName,
}) => {
  const open = (url: string | null | undefined, linkType: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!url) return;
    if (context) trackLinkClick(context, contextId, linkType, contextName);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (
    !hasStreamingLinks({
      spotifyLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      youtubeLink,
      soundcloudLink,
    })
  ) {
    return null;
  }

  const icon = size === "md" ? "w-5 h-5" : "w-4 h-4";
  const gap = size === "md" ? "gap-4" : "gap-3";

  return (
    <div className={`flex flex-wrap items-center ${gap} ${className}`}>
      {spotifyLink && (
        <button
          type="button"
          onClick={(e) => open(spotifyLink, "spotify", e)}
          className="text-gray-300 hover:text-[#1ed760] transition-colors rounded-md p-1 -m-1"
          aria-label="Open on Spotify"
        >
          <FaSpotify className={icon} aria-hidden />
        </button>
      )}
      {appleMusicLink && (
        <button
          type="button"
          onClick={(e) => open(appleMusicLink, "appleMusic", e)}
          className="text-gray-300 hover:text-white transition-colors rounded-md p-1 -m-1"
          aria-label="Open on Apple Music"
        >
          <FaApple className={icon} aria-hidden />
        </button>
      )}
      {tidalLink && (
        <button
          type="button"
          onClick={(e) => open(tidalLink, "tidal", e)}
          className="text-gray-300 hover:text-white transition-colors rounded-md p-1 -m-1"
          aria-label="Open on Tidal"
        >
          <SiTidal className={icon} aria-hidden />
        </button>
      )}
      {amazonMusicLink && (
        <button
          type="button"
          onClick={(e) => open(amazonMusicLink, "amazonMusic", e)}
          className="text-gray-300 hover:text-[#25d1da] transition-colors rounded-md p-1 -m-1"
          aria-label="Open on Amazon Music"
        >
          <SiAmazonmusic className={icon} aria-hidden />
        </button>
      )}
      {youtubeLink && (
        <button
          type="button"
          onClick={(e) => open(youtubeLink, "youtube", e)}
          className="text-gray-300 hover:text-[#ff0033] transition-colors rounded-md p-1 -m-1"
          aria-label="Open on YouTube"
        >
          <FaYoutube className={icon} aria-hidden />
        </button>
      )}
      {soundcloudLink && (
        <button
          type="button"
          onClick={(e) => open(soundcloudLink, "soundcloud", e)}
          className="text-gray-300 hover:text-[#ff5500] transition-colors rounded-md p-1 -m-1"
          aria-label="Open on SoundCloud"
        >
          <FaSoundcloud className={icon} aria-hidden />
        </button>
      )}
    </div>
  );
};

export default StreamingLinks;
