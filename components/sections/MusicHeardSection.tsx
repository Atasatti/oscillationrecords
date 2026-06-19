"use client";
import React from "react";
import IconInput from "../local-ui/IconInput";
import { ArrowRight } from "lucide-react";
import clsx from "clsx"; // optional: use clsx for cleaner conditional classes
import { usePageMedia } from "@/hooks/use-page-media";

interface MusicHeardSectionProps {
  heading: string;
  subtext: string;
  className?: string; // optional className prop
}

const MusicHeardSection: React.FC<MusicHeardSectionProps> = ({
  heading,
  subtext,
  className,
}) => {
  const { bgMusicHeard } = usePageMedia();
  return (
    <div
      className={clsx(
        "bg-center bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto py-14 sm:py-20 md:py-28",
        className
      )}
      style={{ backgroundImage: `url('${bgMusicHeard}')` }}
    >
      <p className="font-light text-3xl sm:text-4xl md:text-5xl text-center tracking-tighter px-4">
        {heading}
      </p>
      <p className="text-muted-foreground text-sm sm:text-base md:text-lg text-center mt-3 font-light px-4">
        {subtext}
      </p>
      <div className="flex justify-center mt-8 sm:mt-12 md:mt-16 px-4">
        <IconInput
          placeholder="enter your email"
          icon={ArrowRight}
          className="max-w-80 w-full"
        />
      </div>
    </div>
  );
};

export default MusicHeardSection;
