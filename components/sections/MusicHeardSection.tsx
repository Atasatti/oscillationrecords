"use client";
import React from "react";
import NewsletterToggle from "../local-ui/NewsletterToggle";
import clsx from "clsx"; // optional: use clsx for cleaner conditional classes
import { usePageMedia } from "@/hooks/use-page-media";

interface MusicHeardSectionProps {
  heading: string;
  subtext: string;
  /** Optional brand/mission line shown as a small eyebrow above the heading —
   * used on the homepage where the standalone mission section was folded in. */
  mission?: string;
  className?: string; // optional className prop
}

const MusicHeardSection: React.FC<MusicHeardSectionProps> = ({
  heading,
  subtext,
  mission,
  className,
}) => {
  const { bgMusicHeard } = usePageMedia();
  return (
    <div
      className={clsx(
        "bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-12 sm:py-16 md:py-24",
        className
      )}
      style={{ backgroundImage: `url('${bgMusicHeard}')` }}
    >
      {mission ? (
        <p className="mx-auto mb-5 max-w-2xl text-center text-sm font-light leading-relaxed text-muted-foreground sm:mb-6 sm:text-base">
          {mission}
        </p>
      ) : null}
      <p className="font-light text-3xl sm:text-4xl md:text-5xl text-center tracking-tighter px-4">
        {heading}
      </p>
      <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 font-light px-4">
        {subtext}
      </p>
      <div className="flex justify-center mt-8 sm:mt-12 md:mt-16 px-4">
        <div className="max-w-md w-full">
          <NewsletterToggle />
        </div>
      </div>
    </div>
  );
};

export default MusicHeardSection;
