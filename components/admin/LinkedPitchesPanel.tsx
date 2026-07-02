"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";

/**
 * Pitches linked to a release or artist, shown on the admin detail pages. Reads
 * the outreach API, so it hides itself for viewers without task/outreach access
 * (a catalog-only role gets a 403) and when there are no linked pitches.
 */
type Pitch = { id: string; status: string; contact: { name: string; outlet: string } };

const STATUS: Record<string, { label: string; dot: string }> = {
  not_sent: { label: "Not sent", dot: "bg-zinc-500" },
  sent: { label: "Sent", dot: "bg-sky-400" },
  followed_up: { label: "Followed up", dot: "bg-amber-400" },
  accepted: { label: "Accepted", dot: "bg-emerald-500" },
  declined: { label: "Declined", dot: "bg-red-500" },
};

export default function LinkedPitchesPanel({ releaseId, artistId }: { releaseId?: string; artistId?: string }) {
  const [items, setItems] = useState<Pitch[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    const key = releaseId ? `releaseId=${releaseId}` : artistId ? `artistId=${artistId}` : "";
    if (!key) return;
    let alive = true;
    fetch(`/api/outreach/pitches?pageSize=100&${key}`)
      .then((r) => {
        if (r.status === 403) throw new Error("denied");
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((d) => { if (alive) { setItems(d.items ?? []); setState("ok"); } })
      .catch((e) => { if (alive) setState(e.message === "denied" ? "denied" : "ok"); });
    return () => { alive = false; };
  }, [releaseId, artistId]);

  // Hide while loading, if the viewer can't read pitches, or if there are none.
  if (state !== "ok" || items.length === 0) return null;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <Send className="h-5 w-5 text-gray-400" /> Pitches
          <span className="text-sm text-gray-500">{items.length}</span>
        </h2>
        <Link href="/admin/outreach/pitches" className="text-sm text-gray-400 transition-colors hover:text-white">
          Manage in Pitches →
        </Link>
      </div>
      <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
        {items.map((p) => {
          const s = STATUS[p.status] ?? { label: p.status, dot: "bg-zinc-500" };
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-gray-200">{p.contact.outlet || p.contact.name}</p>
                {p.contact.outlet && p.contact.name ? (
                  <p className="truncate text-xs text-gray-500">{p.contact.name}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-gray-500">{s.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
