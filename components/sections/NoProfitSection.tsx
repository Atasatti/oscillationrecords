"use client";

import Image from "next/image";
import React from "react";
import { motion } from "motion/react";
import { usePageMedia } from "@/hooks/use-page-media";

const NoProfitSection = () => {
  const { homeNoProfit, bgProfit } = usePageMedia();
  return (
    <div
      className="relative overflow-hidden bg-background bg-center bg-contain bg-no-repeat px-4 sm:px-6 md:px-[10%] w-full mx-auto mt-0 pt-12 sm:pt-16 md:pt-20 pb-20 sm:pb-32 md:pb-40"
      style={{ backgroundImage: `url('${bgProfit}')` }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-28 bg-gradient-to-b from-transparent via-background/75 to-background sm:h-36 md:h-44"
        aria-hidden
      />

      <div className="relative z-[2]">
        <p className="font-light text-2xl sm:text-3xl md:text-4xl lg:text-5xl text-center tracking-tighter">
          Oscillation Records: Built for
          <br /> <span className="font-normal opacity-35">Artists</span>, Not
          Profit.
        </p>

        <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-8 md:gap-4 mt-12 sm:mt-16 md:mt-20 lg:mt-30">

          {/* Left text */}
          <div className="w-full md:w-1/3 order-2 md:order-1">
            <p className="text-xs sm:text-sm font-light text-muted-foreground mt-0 md:mt-5 text-center md:text-left">
              We&apos;re not a major label. We&apos;re a team of music lovers
              who believe in doing things differently. Based in Manchester but
              working globally, we focus on raw talent, smart marketing, and
              creating real opportunities for artists.
            </p>
          </div>

          {/* 3D floating image + ground shadow */}
          <div className="order-1 md:order-2 flex-shrink-0 flex flex-col items-center gap-3">
            <div style={{ perspective: "600px" }}>
              <motion.div
                style={{ transformStyle: "preserve-3d" }}
                /*
                 * initial sets the "left" end of the swing.
                 * animate sets the "right" end.
                 * repeatType:"mirror" bounces between the two forever —
                 * no jump, no restart, velocity is always continuous.
                 */
                animate={{
                  rotateY: [0, 10.6, 15, 10.6, 0, -10.6, -15, -10.6, 0],
                  y:       [-12, -8.5, 0, 8.5, 12, 8.5, 0, -8.5, -12],
                  rotateZ: [0, 1.1, 1.5, 1.1, 0, -1.1, -1.5, -1.1, 0],
                }}
                transition={{
                  duration: 3,
                  ease: "linear",
                  repeat: Infinity,
                  repeatType: "loop",
                  times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
                }}
                whileHover={{
                  rotateY: 28,
                  scale: 1.1,
                  y: -16,
                  transition: { type: "spring", stiffness: 180, damping: 18 },
                }}
              >
                <Image
                  src={homeNoProfit}
                  alt="No Profit Image"
                  width={230}
                  height={230}
                  className="w-40 h-40 sm:w-48 sm:h-48 md:w-56 md:h-56 lg:w-[230px] lg:h-[230px] drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]"
                  unoptimized={homeNoProfit.startsWith("/")}
                />
              </motion.div>
            </div>

            {/* Ground shadow — synced with the float so it shrinks as the image lifts */}
            <motion.div
              className="rounded-full bg-black/30 blur-md"
              animate={{
                scaleX:  [0.7, 0.79, 0.85, 0.92, 1.0, 0.92, 0.85, 0.79, 0.7],
                opacity: [0.2, 0.24, 0.32, 0.40, 0.45, 0.40, 0.32, 0.24, 0.2],
              }}
              transition={{
                duration: 3,
                ease: "linear",
                repeat: Infinity,
                repeatType: "loop",
                times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
              }}
              whileHover={{
                scaleX: 0.7,
                opacity: 0.2,
                transition: { type: "spring", stiffness: 180, damping: 18 },
              }}
              style={{ width: "120px", height: "16px" }}
            />
          </div>

          {/* Right text */}
          <div className="w-full md:w-1/3 flex items-center md:items-end justify-center md:justify-end order-3">
            <p className="text-xs sm:text-sm font-light text-muted-foreground mt-0 md:mt-5 text-center md:text-right">
              No endless meetings. No BS. Just results.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default NoProfitSection;
