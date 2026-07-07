"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Check, X, Pencil } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import Segmented from "@/components/admin/ui/Segmented";
import type { OnboardingChecks } from "@/lib/artist-onboarding";

export type Row = {
  id: string;
  name: string;
  draft: boolean;
  showOnWebsite: boolean;
  checks: OnboardingChecks;
  createdAt: string;
};

type Filter = "all" | "drafts" | "not_ready" | "ready";

function CheckChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"
      }`}
    >
      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {label}
    </span>
  );
}

export default function OnboardingClient({ initial }: { initial: Row[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { all: initial.length, drafts: 0, not_ready: 0, ready: 0 };
    for (const r of initial) {
      if (r.draft) c.drafts += 1;
      if (r.checks.ready) c.ready += 1; else c.not_ready += 1;
    }
    return c;
  }, [initial]);

  const visible = useMemo(() => {
    const pass = (r: Row) =>
      filter === "all" ? true :
      filter === "drafts" ? r.draft :
      filter === "ready" ? r.checks.ready :
      !r.checks.ready;
    // Blockers first, then drafts, then newest.
    return initial.filter(pass).slice().sort((a, b) => {
      if (a.checks.ready !== b.checks.ready) return a.checks.ready ? 1 : -1;
      if (a.draft !== b.draft) return a.draft ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [initial, filter]);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "drafts", label: "Drafts" },
    { key: "not_ready", label: "Not ready" },
    { key: "ready", label: "Ready" },
  ];

  return (
    <div>
      <PageHeader
        title="Artist onboarding"
        description="Who's ready to go live and who's blocked — the three fields an artist needs to publish (name, biography, photo). For discoverability, see each artist's SEO score in the editor."
      />

      <div className="mb-4">
        <Segmented
          ariaLabel="Filter artists"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] }))}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {initial.length === 0 ? "No artists yet." : "Nothing here."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name || "Untitled"}</span>
                    {r.draft ? (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">Draft</span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">Live</span>
                    )}
                    {r.checks.ready ? (
                      <span className="text-xs text-emerald-400">Ready to publish</span>
                    ) : (
                      <span className="text-xs text-red-300/90">Blocked: {r.checks.missing.join(", ")}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <CheckChip label="Name" ok={r.checks.name} />
                    <CheckChip label="Biography" ok={r.checks.bio} />
                    <CheckChip label="Photo" ok={r.checks.photo} />
                  </div>
                </div>
                <Link
                  href={`/admin/catalog/artists/${r.id}/edit`}
                  title="Edit artist"
                  aria-label={`Edit ${r.name}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
