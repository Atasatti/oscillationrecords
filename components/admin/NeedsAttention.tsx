"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, CalendarClock, CheckCircle2, ChevronRight } from "lucide-react";

interface Card {
  key: string;
  label: string;
  count: number;
  href: string;
  hint: string;
  icon: React.ElementType;
}

/**
 * Dashboard triage strip: surfaces work that needs doing — drafts to finish and
 * releases going live soon — each deep-linking into the filtered Releases hub.
 */
export default function NeedsAttention() {
  const [drafts, setDrafts] = useState(0);
  const [soon, setSoon] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, s] = await Promise.all([
          fetch("/api/releases?status=DRAFT&pageSize=1").then((r) =>
            r.ok ? r.json() : { total: 0 }
          ),
          fetch("/api/releases?status=SCHEDULED&pageSize=100").then((r) =>
            r.ok ? r.json() : { items: [] }
          ),
        ]);
        if (cancelled) return;
        setDrafts(d.total || 0);
        const horizon = Date.now() + 14 * 24 * 60 * 60 * 1000;
        const soonCount = (s.items || []).filter((r: { releaseDate: string | null }) => {
          if (!r.releaseDate) return false;
          const t = new Date(r.releaseDate).getTime();
          return Number.isFinite(t) && t <= horizon;
        }).length;
        setSoon(soonCount);
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;

  const cards: Card[] = [];
  if (drafts > 0) {
    cards.push({
      key: "drafts",
      label: `${drafts} draft${drafts === 1 ? "" : "s"} to finish`,
      count: drafts,
      href: "/admin/catalog/releases?status=DRAFT",
      hint: "Add tracks, then publish",
      icon: FileText,
    });
  }
  if (soon > 0) {
    cards.push({
      key: "soon",
      label: `${soon} release${soon === 1 ? "" : "s"} going live soon`,
      count: soon,
      href: "/admin/catalog/releases?status=SCHEDULED",
      hint: "Scheduled within 14 days",
      icon: CalendarClock,
    });
  }

  if (cards.length === 0) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        You&apos;re all caught up — no drafts or imminent releases.
      </div>
    );
  }

  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Link
            key={c.key}
            href={c.href}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {c.label}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        );
      })}
    </div>
  );
}
