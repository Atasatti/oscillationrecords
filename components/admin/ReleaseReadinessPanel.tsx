"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ClipboardCheck } from "lucide-react";
import type { ReleaseReadinessResult } from "@/lib/release-readiness";

/**
 * "Is this release ready to publish?" checklist, shown on the release detail
 * page. Computed server-side from the release's existing fields (artwork, tracks,
 * UPC/ISRC, date, artist, genre, links). Hides itself if the viewer lacks catalog
 * access (403).
 */
export default function ReleaseReadinessPanel({ releaseId }: { releaseId: string }) {
  const [data, setData] = useState<ReleaseReadinessResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/releases/${releaseId}/readiness`)
      .then((r) => {
        if (r.status === 403) throw new Error("hidden");
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((d) => { if (alive) { setData(d); setState("ok"); } })
      .catch(() => { if (alive) setState("hidden"); });
    return () => { alive = false; };
  }, [releaseId]);

  if (state !== "ok" || !data) return null;

  const pct = Math.round((data.doneCount / data.total) * 100);

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ClipboardCheck className="h-5 w-5 text-gray-400" /> Release readiness
          <span className="text-sm text-gray-500">{data.doneCount}/{data.total}</span>
        </h2>
        {data.ready ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready to publish
          </span>
        ) : null}
      </div>

      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className="grid gap-px overflow-hidden rounded-xl border border-gray-800 bg-gray-800 sm:grid-cols-2">
        {data.items.map((it) => (
          <li key={it.key} className="flex items-start gap-2.5 bg-[#0F0F0F] px-4 py-3">
            {it.done ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />
            )}
            <div className="min-w-0">
              <p className={`text-sm ${it.done ? "text-gray-400" : "text-gray-200"}`}>{it.label}</p>
              {!it.done && it.detail ? <p className="mt-0.5 text-xs text-amber-400/80">{it.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
