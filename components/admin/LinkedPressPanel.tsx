"use client";

import { useEffect, useState } from "react";
import { Newspaper, ExternalLink } from "lucide-react";

/**
 * Press coverage linked to a release or artist, shown on the admin detail pages.
 * Reads the public press API (press is public data). Hides itself entirely when
 * there's no coverage, so a release/artist with none shows nothing.
 */
type PressItem = { id: string; title: string; publisher: string; articleUrl: string; publishedAt: string | null };

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : null;
}

export default function LinkedPressPanel({ releaseId, artistId }: { releaseId?: string; artistId?: string }) {
  const [items, setItems] = useState<PressItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const key = releaseId ? `releaseId=${releaseId}` : artistId ? `artistId=${artistId}` : "";
    if (!key) return;
    let alive = true;
    fetch(`/api/press?${key}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (alive) { setItems(Array.isArray(d) ? d : []); setReady(true); } })
      .catch(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [releaseId, artistId]);

  // Only show once loaded and there's actually coverage.
  if (!ready || items.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="mb-4 flex items-center gap-2 text-2xl font-light tracking-tighter">
        <Newspaper className="h-5 w-5 text-gray-400" /> Press coverage
        <span className="text-sm text-gray-500">{items.length}</span>
      </h2>
      <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
        {items.map((p) => {
          const when = fmt(p.publishedAt);
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-200">{p.title}</p>
                <p className="truncate text-xs text-gray-500">{p.publisher}{when ? ` · ${when}` : ""}</p>
              </div>
              <a
                href={p.articleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-gray-400 transition-colors hover:text-white"
              >
                Read <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
