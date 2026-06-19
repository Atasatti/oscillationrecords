"use client";

import Image from "next/image";
import React from "react";
import { motion } from "motion/react";
import { usePageMedia } from "@/hooks/use-page-media";

const AboutHeroSection = () => {
  const { aboutHero, bgHero } = usePageMedia();
  return (
    <div
      className="bg-background bg-center bg-no-repeat px-[10%] w-full mx-auto py-14"
      style={{ backgroundImage: `url('${bgHero}')` }}
    >
      <p className="text-center uppercase text-muted-foreground text-xl tracking-widest font-light">
        About Us
      </p>
      <div className="text-center mt-4">
        {/* First line */}
        <h1 className="text-5xl font-bold leading-tight">
          Oscillation Records: Built for
        </h1>

        {/* Second line with embedded vinyl record — continuous spin */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-gray-500 text-5xl font-bold">Artists,</span>

          <div style={{ perspective: "400px" }} className="relative w-15 h-15 md:w-20 md:h-20 lg:w-24 lg:h-24">
            <motion.div
              className="relative w-full h-full"
              animate={{ rotateZ: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            >
              <Image
                src="/record-disk.svg"
                alt="Vinyl Record"
                fill
                className="object-contain mt-2"
              />
            </motion.div>
          </div>

          <span className="text-5xl font-bold">Not Profit.</span>
        </div>
      </div>

      {/* Hero image — big elliptical float */}
      <div style={{ perspective: "900px" }} className="flex justify-center mt-14">
        <motion.div
          animate={{
            y:       [0, -22, -18, -8, 0, 8, 18, 22, 18, 8, 0, -8, -18, -22, 0],
            rotateY: [0,  4,   12,  18, 20, 18, 12, 4, -4, -12, -20, -18, -12, -4, 0],
            rotateZ: [0,  1,   2,   1.5, 0, -1.5, -2, -1, 0, 1, 2, 1.5, 0.5, -0.5, 0],
          }}
          transition={{
            duration: 5,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop",
            times: [0, 0.07, 0.14, 0.21, 0.28, 0.35, 0.42, 0.5, 0.57, 0.64, 0.71, 0.78, 0.85, 0.93, 1],
          }}
          style={{ transformStyle: "preserve-3d" }}
          whileHover={{
            scale: 1.06,
            rotateY: 25,
            y: -28,
            transition: { type: "spring", stiffness: 180, damping: 16 },
          }}
        >
          <Image
            src={aboutHero}
            alt="hero"
            width={300}
            height={200}
            className="drop-shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
            unoptimized={aboutHero.startsWith("/")}
          />
        </motion.div>
      </div>
    </div>
  );
};

export default AboutHeroSection;
