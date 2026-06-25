"use client";
import React, { useState } from "react";
import PressCard from "@/components/local-ui/PressCard";

type PressItem = React.ComponentProps<typeof PressCard>["item"];

// Show this many press features before the "Show all" reveal. Every item is
// still rendered in the DOM (overflow is just visually hidden), so it stays
// crawlable — the cap is purely to keep the page short and scannable.
const INITIAL_PRESS = 6;

export default function ArtistPressSection({ items }: { items: PressItem[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;

  return (
    <section className="px-[10%] py-14 text-white">
      <h2 className="mb-6 text-2xl font-light tracking-tighter">
        Press &amp; Features <span className="text-gray-500">({items.length})</span>
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <div key={item.id} className={!showAll && i >= INITIAL_PRESS ? "hidden" : ""}>
            <PressCard item={item} />
          </div>
        ))}
      </div>
      {items.length > INITIAL_PRESS ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-6 rounded-full border border-white/15 px-5 py-2 text-sm text-gray-300 transition-colors hover:border-white/30 hover:text-white"
          aria-expanded={showAll}
        >
          {showAll ? "Show fewer" : `Show all ${items.length} features`}
        </button>
      ) : null}
    </section>
  );
}
