"use client";

import Image from "next/image";
import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { usePageMedia } from "@/hooks/use-page-media";
import { DEFAULT_PAGE_MEDIA } from "@/lib/page-media-defaults";

const AboutHeroSection = () => {
  const { aboutHeadingLogo, aboutHero, bgHero } = usePageMedia();
  // Reduced-motion users get the static composition (no infinite spin/float).
  const reduced = useReducedMotion();
  // If an admin-uploaded logo can no longer load (object deleted from S3, bad
  // URL), fall back to the built-in brand mark instead of a broken image in the
  // middle of the heading. Reset when the configured logo changes.
  const [logoBroken, setLogoBroken] = React.useState(false);
  React.useEffect(() => setLogoBroken(false), [aboutHeadingLogo]);
  const logoSrc = logoBroken ? DEFAULT_PAGE_MEDIA.aboutHeadingLogo : aboutHeadingLogo;
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

        {/* Second line with the embedded brand logo — gentle float. "Artists" is
            emphasised the same bright white as "Not Profit." (was muted grey). */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-5xl font-bold">Artists,</span>

          <div className="relative w-15 h-15 md:w-20 md:h-20 lg:w-24 lg:h-24">
            <motion.div
              className="relative w-full h-full"
              animate={reduced ? undefined : { y: [0, -8, 0, 8, 0] }}
              transition={reduced ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* object-contain in a fixed square keeps any logo shape aligned
                  with the heading text; the optimizer preserves PNG/WebP alpha,
                  and the built-in /public default is served as-is (same pattern
                  as aboutHero below). */}
              <Image
                src={logoSrc}
                alt="Oscillation Records logo"
                fill
                className="object-contain"
                unoptimized={logoSrc.startsWith("/")}
                onError={() => setLogoBroken(true)}
              />
            </motion.div>
          </div>

          <span className="text-5xl font-bold">Not Profit.</span>
        </div>
      </div>

      {/* Hero image — big elliptical float */}
      <div style={{ perspective: "900px" }} className="flex justify-center mt-14">
        <motion.div
          animate={
            reduced
              ? undefined
              : {
                  y:       [0, -22, -18, -8, 0, 8, 18, 22, 18, 8, 0, -8, -18, -22, 0],
                  rotateY: [0,  4,   12,  18, 20, 18, 12, 4, -4, -12, -20, -18, -12, -4, 0],
                  rotateZ: [0,  1,   2,   1.5, 0, -1.5, -2, -1, 0, 1, 2, 1.5, 0.5, -0.5, 0],
                }
          }
          transition={
            reduced
              ? undefined
              : {
                  duration: 5,
                  ease: "linear",
                  repeat: Infinity,
                  repeatType: "loop",
                  times: [0, 0.07, 0.14, 0.21, 0.28, 0.35, 0.42, 0.5, 0.57, 0.64, 0.71, 0.78, 0.85, 0.93, 1],
                }
          }
          style={{ transformStyle: "preserve-3d" }}
          whileHover={
            reduced
              ? undefined
              : {
                  scale: 1.06,
                  rotateY: 25,
                  y: -28,
                  transition: { type: "spring", stiffness: 180, damping: 16 },
                }
          }
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
