"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PressCard from "@/components/local-ui/PressCard";

type PressItem = React.ComponentProps<typeof PressCard>["item"];

const SCROLL_GAP_PX = 16; // matches gap-4

// Mirrors the homepage "New Music" release carousel (NewMusicSection) so the
// artist page reads consistently: flanking arrows, hidden scrollbar, fixed-width
// cards and a gentle auto-advance that pauses on hover/touch and only runs while
// the carousel is on screen. Every item stays in the DOM (crawlable).
export default function ArtistPressSection({ items }: { items: PressItem[] }) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseForInteraction = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    setIsPaused(true);
  }, []);
  const resumeAfterDelay = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setIsPaused(false), 4000);
  }, []);
  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
  }, []);

  const updateScrollArrows = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const epsilon = 2;
    setCanScrollLeft(scrollLeft > epsilon);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - epsilon);
  }, []);

  const scrollByCard = (direction: "prev" | "next") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const delta = first.offsetWidth + SCROLL_GAP_PX;
    el.scrollBy({ left: direction === "next" ? delta : -delta, behavior: "smooth" });
  };

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || items.length === 0) return;
    updateScrollArrows();
    el.addEventListener("scroll", updateScrollArrows, { passive: true });
    const ro = new ResizeObserver(() => updateScrollArrows());
    ro.observe(el);
    const id = requestAnimationFrame(() => updateScrollArrows());
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener("scroll", updateScrollArrows);
      ro.disconnect();
    };
  }, [items, updateScrollArrows]);

  // Auto-advance only once the carousel is on screen.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || items.length === 0) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  // Gentle auto-advance: step one card every few seconds, loop at the end.
  // Pauses on hover / touch and is disabled for reduced-motion users.
  useEffect(() => {
    if (items.length <= 1 || isPaused || !isInView) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const id = setInterval(() => {
      const node = scrollContainerRef.current;
      if (!node) return;
      const first = node.firstElementChild as HTMLElement | null;
      const delta = first ? first.offsetWidth + SCROLL_GAP_PX : node.clientWidth;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 4;
      node.scrollTo({ left: atEnd ? 0 : node.scrollLeft + delta, behavior: "smooth" });
    }, 4500);

    return () => clearInterval(id);
  }, [items, isPaused, isInView]);

  if (!items.length) return null;

  return (
    <section className="px-[10%] py-14 text-white">
      <h2 className="mb-6 text-2xl font-light tracking-tighter">
        Press &amp; Features <span className="text-gray-500">({items.length})</span>
      </h2>
      <div
        className="flex min-w-0 items-center gap-2 sm:gap-3"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={pauseForInteraction}
        onTouchEnd={resumeAfterDelay}
        onTouchCancel={resumeAfterDelay}
      >
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollByCard("prev")}
            aria-label="Previous press features"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 sm:h-11 sm:w-11"
          >
            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
          </button>
        ) : null}
        <div
          ref={scrollContainerRef}
          className="no-scrollbar flex min-w-0 flex-1 gap-4 overflow-x-auto scroll-smooth"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {items.map((item) => (
            <div key={item.id} className="w-72 shrink-0 sm:w-80">
              <PressCard item={item} />
            </div>
          ))}
        </div>
        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scrollByCard("next")}
            aria-label="Next press features"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 sm:h-11 sm:w-11"
          >
            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
          </button>
        ) : null}
      </div>
    </section>
  );
}
