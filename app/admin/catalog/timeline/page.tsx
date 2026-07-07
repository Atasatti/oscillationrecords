"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getCached, setCached } from "@/lib/admin-cache";

type Item = {
  id: string;
  name: string;
  status: "SCHEDULED" | "RELEASED";
  releaseDate: string;
  coverImage: string;
  artistNames: string[];
};

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

const rel = (iso: string) => {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days > 0) return days === 1 ? "tomorrow" : days < 14 ? `in ${days} days` : `in ${Math.round(days / 7)} weeks`;
  const a = -days;
  return a === 1 ? "yesterday" : a < 14 ? `${a} days ago` : `${Math.round(a / 7)} weeks ago`;
};

type Row =
  | { kind: "month"; key: string; label: string }
  | { kind: "today"; key: string }
  | { kind: "release"; key: string; it: Item };

export default function TimelinePage() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    const cached = getCached<Item[]>("release-timeline");
    if (cached) setItems(cached);
    fetch("/api/releases/timeline")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.items) { setItems(j.items); setCached("release-timeline", j.items); } })
      .catch(console.error);
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!items) return [];
    const out: Row[] = [];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const firstFutureId = items.find((it) => new Date(it.releaseDate) >= startOfToday)?.id ?? null;
    let lastMonth = "";
    for (const it of items) {
      const d = new Date(it.releaseDate);
      const mk = `${d.getFullYear()}-${d.getMonth()}`;
      if (mk !== lastMonth) {
        out.push({ kind: "month", key: `m-${mk}`, label: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }) });
        lastMonth = mk;
      }
      if (it.id === firstFutureId) out.push({ kind: "today", key: "today" });
      out.push({ kind: "release", key: it.id, it });
    }
    return out;
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Release timeline"
        description="Your rollout across the weeks — upcoming scheduled releases and the last six months of live ones."
      />

      {items === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4"><Skeleton className="h-12 w-full" /></div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          Nothing dated yet. Schedule a release (or set its release date) to see it on the timeline.
        </div>
      ) : (
        <div className="relative">
          {/* vertical rail — the dots below sit on it */}
          <span className="absolute bottom-2 left-[7px] top-2 w-px bg-border" aria-hidden />
          <div className="flex flex-col gap-4">
            {rows.map((row) => {
              if (row.kind === "month") {
                return (
                  <h2 key={row.key} className="pl-8 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </h2>
                );
              }
              if (row.kind === "today") {
                return (
                  <div key={row.key} className="relative flex items-center gap-2 pl-8">
                    <span className="absolute left-[7px] h-2 w-2 -translate-x-1/2 rounded-full bg-white ring-2 ring-background" aria-hidden />
                    <span className="text-xs font-medium text-white">Today</span>
                    <span className="h-px flex-1 bg-white/20" aria-hidden />
                  </div>
                );
              }
              const it = row.it;
              const sched = it.status === "SCHEDULED";
              return (
                <div key={row.key} className="relative pl-8">
                  <span
                    className={`absolute left-[7px] top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${sched ? "bg-sky-500" : "bg-emerald-500"}`}
                    aria-hidden
                  />
                  <Link
                    href={`/admin/catalog/releases/${it.id}/edit`}
                    className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-white/20 hover:bg-white/[0.02]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.coverImage} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:underline">{it.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{it.artistNames.join(", ") || "—"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${sched ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                        {sched ? "Scheduled" : "Released"}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{fmtDay(it.releaseDate)} · {rel(it.releaseDate)}</span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
