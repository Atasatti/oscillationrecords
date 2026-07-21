"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getCached, setCached } from "@/lib/admin-cache";
import { releaseEditHref } from "@/lib/release-workflow";

type ReleaseRow = {
  id: string;
  name: string;
  status: string;
  budget: number | null;
  spent: number;
  remaining: number | null;
};
type CategoryRow = { category: string; label: string; amount: number };
type Data = {
  releases: ReleaseRow[];
  totals: { budget: number; spent: number; remaining: number; overBudget: number };
  byCategory: CategoryRow[];
};

const money = (n: number) => (n < 0 ? "-£" + Math.abs(n).toFixed(2) : "£" + n.toFixed(2));

export default function BudgetsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getCached<Data>("budgets-rollup");
    if (cached) { setData(cached); setLoading(false); }
    fetch("/api/releases/budgets")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setData(d); setCached("budgets-rollup", d); } })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totals = data?.totals;
  const catMax = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.amount));

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Spend vs budget across every release — production, promo and everything else. Set a budget and log spend in each release's editor."
      />

      {/* Totals */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Total budget</p>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{loading && !totals ? <Skeleton className="h-7 w-20" /> : money(totals?.budget ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Total spent</p>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{loading && !totals ? <Skeleton className="h-7 w-20" /> : money(totals?.spent ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Remaining</p>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${(totals?.remaining ?? 0) < 0 ? "text-red-400" : "text-emerald-400"}`}>
            {loading && !totals ? <Skeleton className="h-7 w-20" /> : money(totals?.remaining ?? 0)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Over budget</p>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${(totals?.overBudget ?? 0) > 0 ? "text-red-400" : ""}`}>
            {loading && !totals ? (
              <Skeleton className="h-7 w-12" />
            ) : (
              <>
                {totals?.overBudget ?? 0}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  {(totals?.overBudget ?? 0) === 1 ? "release" : "releases"}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Spend by category */}
      {data && data.byCategory.length > 0 ? (
        <div className="mb-8 rounded-xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Spend by category</p>
          <div className="flex flex-col gap-2">
            {data.byCategory.map((c) => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm text-gray-300">{c.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${(c.amount / catMax) * 100}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-gray-300">{money(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Per-release */}
      {loading && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4"><Skeleton className="h-5 w-64" /></div>
          ))}
        </div>
      ) : data && data.releases.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="min-w-0 flex-1">Release</span>
            <span className="w-24 shrink-0 text-right">Budget</span>
            <span className="w-24 shrink-0 text-right">Spent</span>
            <span className="w-28 shrink-0 text-right">Remaining</span>
            <span className="w-4 shrink-0" />
          </div>
          {data.releases.map((r) => {
            const over = r.remaining !== null && r.remaining < 0;
            return (
              <Link
                key={r.id}
                href={releaseEditHref(r.id, "budget")}
                className="group flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-white/[0.02]"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-foreground group-hover:underline">{r.name}</span>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-gray-400">{r.budget === null ? "—" : money(r.budget)}</span>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-gray-200">{money(r.spent)}</span>
                <span className={`w-28 shrink-0 text-right text-sm tabular-nums ${r.remaining === null ? "text-gray-600" : over ? "text-red-400" : "text-emerald-400"}`}>
                  {r.remaining === null ? "no budget" : over ? `${money(Math.abs(r.remaining))} over` : money(r.remaining)}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          No budgets or spend yet. Open a release editor to set a budget and log spend.
        </div>
      )}
    </div>
  );
}
