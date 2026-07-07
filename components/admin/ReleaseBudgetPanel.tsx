"use client";

import { useCallback, useEffect, useState } from "react";
import { Target, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

/**
 * Campaign budget & spend for a release — set a budget target and log promo spend
 * (playlist pitching, ads, PR, radio…), tracked against the budget. Sits below the
 * royalties panel on the release editor. A tracking aid, not accounting. Hides
 * itself if the viewer can't read the release (403).
 */
type Entry = { id: string; amount: number; category: string; date: string | null; note: string | null };
type Data = { budget: number | null; entries: Entry[]; total: number; remaining: number | null };

const CATEGORIES = [
  { value: "playlist", label: "Playlist / curators" },
  { value: "ads", label: "Ads" },
  { value: "pr", label: "PR / press" },
  { value: "radio", label: "Radio" },
  { value: "video", label: "Video / content" },
  { value: "other", label: "Other" },
] as const;
const catLabel = (v: string) => CATEGORIES.find((c) => c.value === v)?.label ?? "Other";

const money = (n: number) => (n < 0 ? "-£" + Math.abs(n).toFixed(2) : "£" + n.toFixed(2));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

export default function ReleaseBudgetPanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");

  const [budgetInput, setBudgetInput] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("playlist");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const apply = (d: Data) => {
    setData(d);
    setBudgetInput(d.budget != null ? String(d.budget) : "");
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/spend`);
      if (!r.ok) throw new Error("hidden");
      apply(await r.json());
      setState("ok");
    } catch {
      setState("hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  if (state !== "ok" || !data) return null;

  const saveBudget = async () => {
    const raw = budgetInput.trim();
    const budget = raw === "" ? null : parseFloat(raw);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) { toast.error("Enter a valid budget"); return; }
    setSavingBudget(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/spend`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budget }),
      });
      if (!res.ok) throw new Error();
      apply(await res.json());
    } catch {
      toast.error("Couldn't save — you may not have permission.");
    } finally {
      setSavingBudget(false);
    }
  };

  const addSpend = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 0) { toast.error("Enter an amount"); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, category, date: date || null, note: note || null }),
      });
      if (!res.ok) throw new Error();
      apply(await res.json());
      setAmount(""); setDate(""); setNote("");
    } catch {
      toast.error("Couldn't add — you may not have permission.");
    } finally {
      setAdding(false);
    }
  };

  const removeSpend = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/releases/${releaseId}/spend?entryId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      apply(await res.json());
    } catch {
      toast.error("Couldn't remove — you may not have permission.");
    } finally {
      setBusyId(null);
    }
  };

  const inputCls = "rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none";
  const over = data.remaining !== null && data.remaining < 0;
  const pct = data.budget && data.budget > 0 ? Math.min(100, (data.total / data.budget) * 100) : 0;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <Target className="h-5 w-5 text-gray-400" /> Campaign budget
        </h2>
        <span className="text-sm tabular-nums text-gray-300">Spent {money(data.total)}</span>
      </div>

      {/* Budget target */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Budget target</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-40">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
          <input value={budgetInput} onChange={(e) => setBudgetInput(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="No budget set" aria-label="Budget target"
            className={`${inputCls} w-full py-2 pl-6 pr-3 text-right tabular-nums`} />
        </div>
        <button type="button" onClick={saveBudget} disabled={savingBudget}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50">
          {savingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save budget
        </button>
      </div>

      {/* Budget vs spend bar */}
      {data.budget !== null ? (
        <div className="mb-6 rounded-xl border border-gray-800 bg-[#0F0F0F] p-4">
          <div className="mb-2 flex items-center justify-between text-sm tabular-nums">
            <span className="text-gray-400">{money(data.total)} of {money(data.budget)}</span>
            <span className={over ? "text-red-400" : "text-emerald-400"}>
              {over ? `${money(Math.abs(data.remaining!))} over` : `${money(data.remaining!)} left`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${over ? 100 : pct}%` }} />
          </div>
        </div>
      ) : null}

      {/* Log spend */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Log spend</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.00" aria-label="Spend amount"
            className={`${inputCls} w-full py-2 pl-6 pr-3 text-right tabular-nums`} />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={`${inputCls} sm:w-44`}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (Groover, Meta ads…)" aria-label="Note" className={`${inputCls} min-w-0 flex-1`} />
        <button type="button" onClick={addSpend} disabled={adding || !amount.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>
      {data.entries.length > 0 ? (
        <ul className="overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0">
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-gray-200">{money(e.amount)}</span>
              <span className="w-32 shrink-0 truncate text-xs text-gray-400">{catLabel(e.category)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{[fmtDate(e.date), e.note].filter(Boolean).join(" · ") || "—"}</span>
              <button type="button" onClick={() => removeSpend(e.id)} disabled={busyId === e.id} aria-label="Remove entry"
                className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-red-950/20 hover:text-red-400 disabled:opacity-50">
                {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-600">No spend logged yet — add ad, playlist and PR costs to track them against the budget.</p>
      )}
    </section>
  );
}
