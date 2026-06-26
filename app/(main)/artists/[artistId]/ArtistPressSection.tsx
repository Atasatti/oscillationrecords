"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import PressCard from "@/components/local-ui/PressCard";

type PressItem = React.ComponentProps<typeof PressCard>["item"];

// Press features are text-heavy, so rather than a tall grid they live in a
// single horizontal slider — one clean row the visitor swipes/scrolls through.
// Every item stays in the DOM, so it remains crawlable.
export default function ArtistPressSection({ items }: { items: PressItem[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows, items.length]);

  const scrollByCards = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    // Advance by roughly one card width (incl. gap) so a click reveals the next one.
    const card = el.querySelector<HTMLElement>("[data-press-card]");
    const step = card ? card.offsetWidth + 20 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  if (!items.length) return null;

  return (
    <section className="py-14 text-white">
      <div className="mb-6 flex items-center justify-between px-[10%]">
        <h2 className="text-2xl font-light tracking-tighter">
          Press &amp; Features <span className="text-gray-500">({items.length})</span>
        </h2>
        {items.length > 1 ? (
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              disabled={!canPrev}
              aria-label="Previous press features"
              className="rounded-full border border-white/15 p-2 text-gray-300 transition-colors enabled:hover:border-white/30 enabled:hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              disabled={!canNext}
              aria-label="Next press features"
              className="rounded-full border border-white/15 p-2 text-gray-300 transition-colors enabled:hover:border-white/30 enabled:hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        onScroll={updateArrows}
        className="scroll-themed flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-[10%] pb-3"
      >
        {items.map((item) => (
          <div
            key={item.id}
            data-press-card
            className="h-full w-[85vw] max-w-[22rem] shrink-0 snap-start sm:w-[22rem]"
          >
            <PressCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
