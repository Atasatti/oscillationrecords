"use client";

import { ChevronRight } from "lucide-react";

/**
 * A card whose body collapses behind a clickable header. The header always shows
 * a live `summary` (e.g. "6/10 links", "ISNI —"), so a collapsed section still
 * tells you its state at a glance — the context-aware layout for the artist
 * editor (short page, expand only what you're working on).
 */
export default function CollapsibleCard({
  title,
  summary,
  icon,
  tone = "default",
  open,
  onToggle,
  children,
}: {
  title: string;
  /** Live status shown on the right of the header (filled/missing at a glance). */
  summary?: React.ReactNode;
  /** Optional leading icon (e.g. a lock for the internal section). */
  icon?: React.ReactNode;
  tone?: "default" | "warning";
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const shell =
    tone === "warning"
      ? "border-amber-500/30 bg-amber-500/[0.03]"
      : "border-border bg-card";
  const divider = tone === "warning" ? "border-amber-500/20" : "border-border";

  return (
    <section className={`overflow-hidden rounded-xl border ${shell}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <h3 className="text-base font-medium">{title}</h3>
        {summary != null ? (
          <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{summary}</span>
        ) : null}
      </button>
      {open ? (
        <div className={`border-t ${divider} px-5 pb-5 pt-4`}>{children}</div>
      ) : null}
    </section>
  );
}
