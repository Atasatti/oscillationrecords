"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/local-ui/Toast";
import { getCached, setCached } from "@/lib/admin-cache";
import { CalendarClock, FileEdit, Disc3 } from "lucide-react";
import type { PipelineItem } from "@/app/api/releases/pipeline/route";

type Pipeline = { scheduled: PipelineItem[]; drafts: PipelineItem[] };

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}

// Relative hint for a scheduled release ("in 5 days" / "today" / "overdue").
function relDays(iso: string | null): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / 86_400_000);
  if (days < 0) return { label: "overdue", overdue: true };
  if (days === 0) return { label: "today", overdue: false };
  if (days === 1) return { label: "tomorrow", overdue: false };
  return { label: `in ${days} days`, overdue: false };
}

function PipelineCard({ item }: { item: PipelineItem }) {
  const date = fmtDate(item.releaseDate);
  const rel = item.status === "SCHEDULED" ? relDays(item.releaseDate) : null;

  return (
    <Link
      href={`/admin/catalog/releases/${item.id}/edit`}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-white/20 hover:bg-white/[0.02]"
    >
      {item.coverImage ? (
        <Image src={item.coverImage} alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-white/5 text-muted-foreground">
          <Disc3 className="h-6 w-6" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground group-hover:underline">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {item.artistNames.length ? item.artistNames.join(", ") : "No artist"}
          {date ? <> · {date}{rel ? <span className={rel.overdue ? " text-amber-400" : ""}> ({rel.label})</span> : null}</> : null}
        </p>
      </div>
    </Link>
  );
}

function Section({ icon: Icon, title, items }: { icon: typeof CalendarClock; title: string; items: PipelineItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {title} <span className="tabular-nums">{items.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((it) => <PipelineCard key={it.id} item={it} />)}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const toast = useToast();
  const [data, setData] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = getCached<Pipeline>("release-pipeline");
    if (cached) { setData(cached); setLoading(false); } else { setLoading(true); }
    try {
      const res = await fetch("/api/releases/pipeline");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      setCached("release-pipeline", d);
    } catch {
      if (!cached) toast.error("Failed to load pipeline");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const empty = data && data.scheduled.length === 0 && data.drafts.length === 0;

  return (
    <div>
      <PageHeader
        title="Release pipeline"
        description="Upcoming releases — scheduled and in-progress. Click through to the editor."
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="mb-2 h-4 w-56" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          Nothing in the pipeline — no scheduled or draft releases. New releases you schedule or save as drafts show up here.
        </div>
      ) : (
        <>
          <Section icon={CalendarClock} title="Scheduled" items={data?.scheduled ?? []} />
          <Section icon={FileEdit} title="Drafts" items={data?.drafts ?? []} />
        </>
      )}
    </div>
  );
}
