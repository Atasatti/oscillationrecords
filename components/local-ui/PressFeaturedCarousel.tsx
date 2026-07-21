"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PressCard from "@/components/local-ui/PressCard";
import type { PressItemDTO } from "@/lib/catalog-data";

// Mobile Featured-press carousel: one card per view with native swipe plus side
// arrows, matching the site's other carousels (NewMusicSection). The arrows flank
// the card (never overlap it) and stay mounted so showing/hiding one can't resize
// the full-width card mid-scroll — they just disable + dim at each end.
const GAP_PX = 16; // matches the container's gap-4

export default function PressFeaturedCarousel({ items }: { items: PressItemDTO[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const epsilon = 2;
    setCanScrollLeft(scrollLeft > epsilon);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - epsilon);
  }, []);

  const scrollByCard = (direction: "prev" | "next") => {
    const el = scrollRef.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    const delta = first.offsetWidth + GAP_PX;
    el.scrollBy({ left: direction === "next" ? delta : -delta, behavior: "smooth" });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(() => updateArrows());
    ro.observe(el);
    const id = requestAnimationFrame(() => updateArrows());
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
    };
  }, [items, updateArrows]);

  if (items.length === 0) return null;
  // A single featured item needs no carousel chrome — show it full width.
  if (items.length === 1) return <PressCard item={items[0]!} priority />;

  const arrowBase =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur-sm transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-default disabled:opacity-30";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => scrollByCard("prev")}
        disabled={!canScrollLeft}
        aria-label="Previous press item"
        className={arrowBase}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>

      <div
        ref={scrollRef}
        className="flex min-w-0 flex-1 snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {items.map((item, i) => (
          <div key={item.id} className="w-full shrink-0 snap-start">
            <PressCard item={item} priority={i === 0} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => scrollByCard("next")}
        disabled={!canScrollRight}
        aria-label="Next press item"
        className={arrowBase}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
