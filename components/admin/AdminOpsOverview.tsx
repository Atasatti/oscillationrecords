"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks, Rocket, type LucideIcon } from "lucide-react";

/**
 * A compact operations overview on the admin dashboard: open/overdue tasks and the
 * release pipeline — the "state of play" a staffer wants at a glance. Each card
 * fetches its own domain and HIDES itself if the viewer lacks access (403) or the
 * fetch fails, so scoped roles only see the cards they can use.
 */

function Card({
  href, icon: Icon, label, primary, secondary, secondaryTone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  primary: string;
  secondary?: string;
  secondaryTone?: "amber" | "muted";
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-white/20 hover:bg-white/[0.02]"
    >
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </p>
      <p className="mt-1.5 text-2xl font-light tabular-nums text-foreground">{primary}</p>
      {secondary ? (
        <p className={`mt-0.5 text-xs ${secondaryTone === "amber" ? "text-amber-400" : "text-muted-foreground"}`}>{secondary}</p>
      ) : null}
    </Link>
  );
}

function useDomain<T>(url: string, map: (json: unknown) => T) {
  const [data, setData] = useState<T | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => { if (r.status === 403) throw new Error("hide"); if (!r.ok) throw new Error("fail"); return r.json(); })
      .then((j) => { if (alive) setData(map(j)); })
      .catch(() => { if (alive) setHidden(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return { data, hidden };
}

function TasksCard() {
  const { data, hidden } = useDomain(`/api/outreach/tasks?isTemplate=false`, (j) => {
    const items = (j as { items?: { status: string; dueAt: string | null }[] }).items ?? [];
    const now = Date.now();
    const open = items.filter((t) => t.status !== "done").length;
    const overdue = items.filter((t) => t.status !== "done" && t.dueAt && new Date(t.dueAt).getTime() < now).length;
    return { open, overdue };
  });
  if (hidden || !data) return null;
  return (
    <Card
      href="/admin/tasks"
      icon={ListChecks}
      label="Tasks"
      primary={`${data.open} open`}
      secondary={data.overdue > 0 ? `${data.overdue} overdue` : "nothing overdue"}
      secondaryTone={data.overdue > 0 ? "amber" : "muted"}
    />
  );
}

function PipelineCard() {
  const { data, hidden } = useDomain(`/api/releases/pipeline`, (j) => {
    const d = j as { scheduled?: { name: string; releaseDate: string | null }[]; drafts?: unknown[] };
    const scheduled = d.scheduled ?? [];
    const next = scheduled[0];
    let hint: string | undefined;
    if (next) {
      const days = next.releaseDate ? Math.round((new Date(next.releaseDate).getTime() - Date.now()) / 86_400_000) : null;
      const when = days === null ? "" : days < 0 ? " (overdue)" : days === 0 ? " (today)" : ` (in ${days}d)`;
      hint = `Next: ${next.name}${when}`;
    }
    return { count: scheduled.length, drafts: (d.drafts ?? []).length, hint };
  });
  if (hidden || !data) return null;
  return (
    <Card
      href="/admin/pipeline"
      icon={Rocket}
      label="Pipeline"
      primary={`${data.count} scheduled`}
      secondary={data.hint ?? (data.drafts > 0 ? `${data.drafts} draft${data.drafts === 1 ? "" : "s"}` : "nothing scheduled")}
    />
  );
}

export default function AdminOpsOverview() {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      <TasksCard />
      <PipelineCard />
    </div>
  );
}
