"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/local-ui/Toast";
import { getCached, setCached } from "@/lib/admin-cache";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PayeeRollup } from "@/app/api/releases/royalties/route";

type Data = { payees: PayeeRollup[]; totals: { owed: number; paid: number; outstanding: number } };

const money = (n: number) => (n < 0 ? "-£" + Math.abs(n).toFixed(2) : "£" + n.toFixed(2));

// ---- CSV statement export (client-side, from the already-loaded rollup) ----
const csvField = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "payee";
const todayIso = () => new Date().toISOString().slice(0, 10);

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const content = rows.map((r) => r.map(csvField).join(",")).join("\r\n");
  // Prepend a BOM so Excel opens the £ signs / UTF-8 correctly.
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function payeeStatement(p: PayeeRollup) {
  const rows: (string | number)[][] = [
    ["Royalty statement", p.payee],
    ["Generated", todayIso()],
    [],
    ["Release", "Owed (£)", "Paid (£)", "Outstanding (£)"],
    ...p.releases.map((r) => [r.name, r.owed.toFixed(2), r.paid.toFixed(2), r.outstanding.toFixed(2)]),
    ["Total", p.owed.toFixed(2), p.paid.toFixed(2), p.outstanding.toFixed(2)],
  ];
  downloadCsv(`statement-${slug(p.payee)}-${todayIso()}.csv`, rows);
}

function allStatements(payees: PayeeRollup[]) {
  const rows: (string | number)[][] = [
    ["Royalty statement — all payees"],
    ["Generated", todayIso()],
    [],
    ["Payee", "Release", "Owed (£)", "Paid (£)", "Outstanding (£)"],
    ...payees.flatMap((p) => [
      ...p.releases.map((r) => [p.payee, r.name, r.owed.toFixed(2), r.paid.toFixed(2), r.outstanding.toFixed(2)]),
      [p.payee, "— Total —", p.owed.toFixed(2), p.paid.toFixed(2), p.outstanding.toFixed(2)],
    ]),
  ];
  downloadCsv(`royalty-statements-${todayIso()}.csv`, rows);
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "owed" | "paid" | "outstanding" }) {
  const color = tone === "outstanding" ? (value > 0 ? "text-amber-400" : "text-emerald-400") : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-light tabular-nums ${color}`}>{money(value)}</p>
    </div>
  );
}

export default function RoyaltiesPage() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const cached = getCached<Data>("royalties-rollup");
    if (cached) { setData(cached); setLoading(false); } else { setLoading(true); }
    try {
      const res = await fetch("/api/releases/royalties");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      setCached("royalties-rollup", d);
    } catch {
      if (!cached) toast.error("Failed to load royalties");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const toggle = (payee: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(payee)) n.delete(payee); else n.add(payee);
      return n;
    });

  const empty = data && data.payees.length === 0;

  return (
    <div>
      <PageHeader
        title="Royalties"
        description="Who's owed what across every release — owed (revenue × split), paid, and still outstanding. A tracking aid, not accounting."
        actions={
          data && data.payees.length > 0 ? (
            <Button variant="outline" onClick={() => allStatements(data.payees)}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="h-4 w-64" />
            </div>
          ))}
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-border bg-card px-5 py-12 text-center text-sm text-muted-foreground">
          No royalties recorded yet. Set revenue splits and record income on a release (in its editor) and it rolls up here.
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Owed" value={data?.totals.owed ?? 0} tone="owed" />
            <Stat label="Paid" value={data?.totals.paid ?? 0} tone="paid" />
            <Stat label="Outstanding" value={data?.totals.outstanding ?? 0} tone="outstanding" />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span className="w-4 shrink-0" />
              <span className="min-w-0 flex-1">Payee</span>
              <span className="w-24 shrink-0 text-right">Owed</span>
              <span className="w-24 shrink-0 text-right">Paid</span>
              <span className="w-28 shrink-0 text-right">Outstanding</span>
            </div>

            {data?.payees.map((p) => {
              const open = expanded.has(p.payee);
              return (
                <div key={p.payee} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggle(p.payee)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="w-4 shrink-0 text-muted-foreground">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                      {p.payee}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {p.releases.length} release{p.releases.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{money(p.owed)}</span>
                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{money(p.paid)}</span>
                    <span className={`w-28 shrink-0 text-right text-sm tabular-nums ${p.outstanding > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {money(p.outstanding)}
                    </span>
                  </button>

                  {open && (
                    <div className="bg-background/40 px-4 pb-3">
                      {p.releases.map((r) => (
                        <Link
                          key={r.id}
                          href={`/admin/catalog/releases/${r.id}/edit`}
                          className="flex items-center gap-3 rounded-md px-4 py-2 pl-11 text-xs transition-colors hover:bg-white/[0.03]"
                        >
                          <span className="min-w-0 flex-1 truncate text-muted-foreground hover:text-foreground">{r.name}</span>
                          <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{money(r.owed)}</span>
                          <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{money(r.paid)}</span>
                          <span className={`w-28 shrink-0 text-right tabular-nums ${r.outstanding > 0 ? "text-amber-400/80" : "text-emerald-400/80"}`}>
                            {money(r.outstanding)}
                          </span>
                        </Link>
                      ))}
                      <div className="mt-2 pl-11">
                        <button
                          type="button"
                          onClick={() => payeeStatement(p)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" /> Download {p.payee}&apos;s statement (CSV)
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
