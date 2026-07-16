"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";

interface ScrollReveal3DProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  /**
   * Render statically visible (no opacity:0 SSR / reveal). Set on the FIRST,
   * above-the-fold section of a page so its LCP content isn't hidden until
   * hydration + IntersectionObserver — reveal only sections further down.
   */
  immediate?: boolean;
}

export default function ScrollReveal3D({
  children,
  delay = 0,
  className,
  immediate = false,
}: ScrollReveal3DProps) {
  const reduced = useReducedMotion();

  // Reduced-motion users, and any above-the-fold section (immediate), get the
  // content statically — never SSR'd at opacity:0, so the LCP element paints
  // without waiting for JS. Also the safe default if JS is slow: content visible.
  if (reduced || immediate) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        // Positive bottom margin makes the reveal fire ~240px BEFORE the section
        // scrolls into view, so it has already faded in by the time a visitor
        // reaches it — no blank gap on mobile (the old "-80px" fired 80px AFTER
        // it entered, leaving a scroll-into-nothing void). once:true = no re-hide.
        viewport={{ once: true, margin: "0px 0px 240px 0px" }}
        transition={{
          duration: 0.5,
          delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
