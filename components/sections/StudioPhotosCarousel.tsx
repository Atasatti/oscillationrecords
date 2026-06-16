"use client";

import React from "react";
import Image from "next/image";

interface StudioPhotosCarouselProps {
  photos: string[];
}

/**
 * Slow, continuously-scrolling carousel of studio photos. The track is rendered
 * twice and translated by exactly one set width (-50%) so the loop is seamless;
 * speed scales with the number of photos so it stays a constant pace. Pauses on
 * hover and stops moving (becomes a normal horizontal scroller) for users who
 * prefer reduced motion.
 */
const StudioPhotosCarousel = ({ photos }: StudioPhotosCarouselProps) => {
  if (!photos || photos.length === 0) return null;

  // Repeat the photos so ONE "set" is wider than any viewport — otherwise on
  // large screens the -50% loop reveals empty space and appears to jump/reset.
  // The track is then that set rendered twice for a seamless loop.
  const reps = Math.max(1, Math.ceil(8 / photos.length));
  const base = Array.from({ length: reps }, () => photos).flat();
  // ~7s per card keeps the pace constant regardless of count.
  const durationSeconds = Math.max(20, base.length * 7);
  const loop = [...base, ...base];

  return (
    <section className="w-full py-4">
      <p className="px-4 sm:px-6 md:px-[10%] text-muted-foreground text-xs sm:text-sm mb-6">
        Turn up the feeling, let the music speak.
      </p>

      <style>{`
        @keyframes studio-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .studio-marquee__track {
          animation: studio-marquee var(--studio-marquee-duration, 40s) linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .studio-marquee { overflow-x: auto; }
          .studio-marquee__track { animation: none; }
        }
      `}</style>

      <div className="studio-marquee relative w-full overflow-hidden">
        {/* Soft edge fades so cards slide in/out instead of hard-cutting */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 sm:w-20 bg-gradient-to-r from-background to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 sm:w-20 bg-gradient-to-l from-background to-transparent"
          aria-hidden
        />

        <div
          className="studio-marquee__track flex w-max"
          style={
            { "--studio-marquee-duration": `${durationSeconds}s` } as React.CSSProperties
          }
        >
          {loop.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="relative mr-4 sm:mr-6 h-52 w-72 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 sm:h-64 sm:w-96 md:h-80 md:w-[30rem]"
            >
              <Image
                src={url}
                alt=""
                fill
                sizes="(max-width: 640px) 18rem, (max-width: 768px) 24rem, 30rem"
                className="object-cover"
                unoptimized={url.startsWith("/")}
                aria-hidden={i >= base.length}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StudioPhotosCarousel;
