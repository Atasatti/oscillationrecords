"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { PressItemDTO } from "@/lib/catalog-data";

/** A single press/coverage card: our summary + link out to the original article. */
export default function PressCard({ item }: { item: PressItemDTO }) {
  const date = item.publishedAt
    ? new Date(item.publishedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <article className="flex w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition-colors hover:border-white/20">
      {item.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image}
          alt=""
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-xs uppercase tracking-wide text-gray-400">
          {item.publisher}
          {date ? <span className="text-gray-500"> · {date}</span> : null}
        </p>
        <h3 className="text-lg font-medium leading-snug text-white">{item.title}</h3>
        {item.summary ? (
          <p className="line-clamp-4 text-sm leading-relaxed text-gray-300">{item.summary}</p>
        ) : null}

        {(item.artists.length > 0 || item.releases.length > 0) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {item.artists.map((a) => (
              <Link
                key={`a-${a.id}`}
                href={`/artists/${a.id}`}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-300 hover:border-white/30 hover:text-white"
              >
                {a.name}
              </Link>
            ))}
            {item.releases.map((r) => (
              <Link
                key={`r-${r.id}`}
                href={`/releases/${r.id}`}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-300 hover:border-white/30 hover:text-white"
              >
                {r.name}
              </Link>
            ))}
          </div>
        ) : null}

        <a
          href={item.articleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium text-white hover:underline"
        >
          Read full article <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </article>
  );
}
