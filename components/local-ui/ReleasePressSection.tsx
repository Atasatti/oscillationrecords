"use client";

import { useEffect, useState } from "react";
import PressCard from "@/components/local-ui/PressCard";
import type { PressItemDTO } from "@/lib/catalog-data";

/**
 * Related press for a release, fetched client-side (the release detail page is a
 * client component). Renders nothing until there's at least one public item.
 */
export default function ReleasePressSection({ releaseId }: { releaseId: string }) {
  const [press, setPress] = useState<PressItemDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/press?releaseId=${encodeURIComponent(releaseId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!cancelled) setPress(Array.isArray(d) ? d : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  if (press.length === 0) return null;

  return (
    <section className="mt-12 text-white">
      <h2 className="mb-6 text-2xl font-light">Press &amp; Features</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {press.map((item) => (
          <PressCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
