"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { usePageMedia } from "@/hooks/use-page-media";

const floatTransition = (duration: number) => ({
  duration,
  ease: "linear" as const,
  repeat: Infinity,
  repeatType: "loop" as const,
  times: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
});

export default function AboutSection2() {
  const { aboutMain, aboutSide1, aboutSide2, aboutSide3, bgAboutSection2 } = usePageMedia();
  return (
    <section
      className="relative bg-no-repeat bg-cover pt-24 pb-50"
      style={{ backgroundImage: `url('${bgAboutSection2}')` }}
    >

      {/* Top right image */}
      <div className="hidden lg:block absolute top-12 right-18" style={{ perspective: "600px" }}>
        <motion.div
          animate={{
            y:       [0, -7, -14, -7, 0, 7, 14, 7, 0],
            rotateZ: [8, 10, 14, 17, 16, 14, 10, 8, 8],
            rotateY: [0, 6,  12,  6,  0, -6, -12, -6, 0],
          }}
          transition={floatTransition(3.5)}
          whileHover={{
            rotateZ: 0, rotateY: 0, scale: 1.08, y: -16,
            transition: { type: "spring", stiffness: 200, damping: 16 },
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Image
            src={aboutSide2}
            alt="Music album cover"
            width={200}
            height={300}
            className="rounded-lg shadow-2xl w-32 h-32 md:w-48 md:h-48 object-cover"
            unoptimized={aboutSide2.startsWith("/")}
          />
        </motion.div>
      </div>

      {/* Center left image */}
      <div className="hidden lg:block absolute top-0 left-18 transform -translate-y-1/2" style={{ perspective: "600px" }}>
        <motion.div
          animate={{
            y:       [0, -6, -12, -6, 0, 6, 12, 6, 0],
            rotateZ: [3, 5,  8,  11, 10, 8,  5, 3, 3],
            rotateX: [0, 4,  8,   4,  0, -4, -8, -4, 0],
          }}
          transition={floatTransition(3)}
          whileHover={{
            rotateZ: 0, rotateX: 0, scale: 1.08, y: -14,
            transition: { type: "spring", stiffness: 200, damping: 16 },
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Image
            src={aboutSide1}
            alt="Music album cover"
            width={200}
            height={300}
            className="rounded-lg shadow-2xl w-28 h-28 md:w-40 md:h-40 object-cover"
            unoptimized={aboutSide1.startsWith("/")}
          />
        </motion.div>
      </div>

      {/* Bottom right image */}
      <div className="hidden lg:block absolute bottom-20 right-18" style={{ perspective: "600px" }}>
        <motion.div
          animate={{
            y:       [0, -8, -16, -8, 0, 8, 16, 8, 0],
            rotateZ: [-10, -8, -4, -2, -3, -5, -8, -10, -10],
            rotateY: [0, -8, -14, -8, 0, 8, 14, 8, 0],
          }}
          transition={floatTransition(4)}
          whileHover={{
            rotateZ: 0, rotateY: 0, scale: 1.08, y: -16,
            transition: { type: "spring", stiffness: 200, damping: 16 },
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Image
            src={aboutSide1}
            alt="Music album cover"
            width={200}
            height={300}
            className="rounded-lg shadow-2xl w-32 h-32 md:w-48 md:h-48 object-cover"
            unoptimized={aboutSide1.startsWith("/")}
          />
        </motion.div>
      </div>

      {/* Bottom left image */}
      <div className="hidden lg:block absolute -bottom-20 left-18" style={{ perspective: "600px" }}>
        <motion.div
          animate={{
            y:       [0, -9, -18, -9, 0, 9, 18, 9, 0],
            rotateZ: [9, 11, 15, 18, 17, 14, 11, 9, 9],
            rotateX: [0, -5, -10, -5, 0, 5, 10, 5, 0],
          }}
          transition={floatTransition(4.5)}
          whileHover={{
            rotateZ: 0, rotateX: 0, scale: 1.08, y: -18,
            transition: { type: "spring", stiffness: 200, damping: 16 },
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <Image
            src={aboutSide3}
            alt="Music album cover"
            width={200}
            height={300}
            className="rounded-lg shadow-2xl w-28 h-28 md:w-40 md:h-40 object-cover"
            unoptimized={aboutSide3.startsWith("/")}
          />
        </motion.div>
      </div>

      <div className="mx-auto max-w-lg">
        <p className="text-muted-foreground text-center font-light mt-8">
          We&apos;re not a major label. We&apos;re a team of music lovers who believe in
          doing things differently. Based in Manchester but working globally, we
          focus on raw talent, smart marketing, and creating real opportunities
          for artists.
        </p>
        <p className="text-muted-foreground text-center font-light mt-6">
          No endless meetings. No BS. Just results.
        </p>
      </div>

      {/* Center image — big elliptical float */}
      <div style={{ perspective: "900px" }} className="flex justify-center mt-22">
        <motion.div
          animate={{
            y:       [0, -8,  -16, -8,  0,  8,  16,  8,  0],
            rotateZ: [6, 8,   11,  14,  13, 11,  8,  6,  6],
            rotateY: [0, 10,  18,  10,   0, -10, -18, -10, 0],
          }}
          transition={floatTransition(4)}
          whileHover={{
            rotateZ: 0, rotateY: 0,
            scale: 1.07,
            y: -22,
            transition: { type: "spring", stiffness: 180, damping: 16 },
          }}
          style={{ transformStyle: "preserve-3d" }}
          className="drop-shadow-[0_24px_40px_rgba(0,0,0,0.55)]"
        >
          <Image
            src={aboutMain}
            width={300}
            height={200}
            alt="section2"
            unoptimized={aboutMain.startsWith("/")}
          />
        </motion.div>
      </div>

      <div className="mx-auto max-w-lg mt-22">
        <p className="font-light text-5xl opacity-90 text-center tracking-tighter">
          The Future of Music Starts Here.
        </p>
        <p className="text-muted-foreground text-center font-light mt-6">
          We&apos;re combining creativity, technology, and smart strategy to build
          something new. This isn&apos;t about following trends—it&apos;s about creating
          them.
        </p>
      </div>
    </section>
  );
}
