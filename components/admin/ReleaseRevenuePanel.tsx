"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

/**
 * Recorded revenue for a release + the resulting "who's owed" breakdown (revenue
 * × each split's %). Sits below the splits panel on the release editor. A tracking
 * aid, not accounting. Hides itself if the viewer can't read the release (403).
 */
type Entry = { id: string; amount: number; date: string | null; note: string | null };
type Owed = { payee: string; percent: number; amount: number };
type Data = { entries: Entry[]; total: number; owed: Owed[] };

const money = (n: number) => "£" + n.toFixed(2);
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

export default function ReleaseRevenuePanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/revenue`);
      if (r.status === 403) throw new Error("hidden");
      if (!r.ok) throw new Error("failed");
      setData(await r.json());
      setState("ok");
    } catch (e) {
      setState(e instanceof Error && e.message === "hidden" ? "hidden" : "hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  if (state !== "ok" || !data) return null;

  const add = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt)) { toast.error("Enter an amount"); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/revenue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, date: date || null, note: note || null }),
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setAmount(""); setDate(""); setNote("");
    } catch {
      toast.error("Couldn't add — you may not have permission.");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/releases/${releaseId}/revenue?entryId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Couldn't remove — you may not have permission.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <Banknote className="h-5 w-5 text-gray-400" /> Revenue
        </h2>
        <span className="text-sm tabular-nums text-gray-300">Total {money(data.total)}</span>
      </div>

      {/* Add entry */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount"
            className="w-full rounded-md border border-gray-700 bg-[#0F0F0F] py-2 pl-6 pr-3 text-right text-sm tabular-nums text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none"
          />
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className="rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white focus:border-gray-500 focus:outline-none"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Source (DistroKid Q2, Bandcamp…)"
          aria-label="Note"
          className="min-w-0 flex-1 rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={adding || !amount.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>

      {/* Entries */}
      {data.entries.length > 0 && (
        <ul className="mb-6 overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0">
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-gray-200">{money(e.amount)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                {[fmtDate(e.date), e.note].filter(Boolean).join(" · ") || "—"}
              </span>
              <button
                type="button"
                onClick={() => remove(e.id)}
                disabled={busyId === e.id}
                aria-label="Remove entry"
                className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-red-950/20 hover:text-red-400 disabled:opacity-50"
              >
                {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Owed breakdown */}
      {data.owed.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Owed (of total)</p>
          <ul className="overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
            {data.owed.map((o) => (
              <li key={o.payee} className="flex items-center gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{o.payee}</span>
                <span className="shrink-0 text-xs tabular-nums text-gray-500">{o.percent}%</span>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-emerald-300">{money(o.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-gray-600">Add payees in Revenue splits above to see who&apos;s owed.</p>
      )}
    </section>
  );
}
