"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Plus, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

/**
 * Release royalties: recorded income, payouts, and the per-payee ledger
 * (owed / paid / outstanding) — owed = total revenue × split %, minus payouts.
 * Sits below the splits panel on the release editor. A tracking aid, not
 * accounting. Hides itself if the viewer can't read the release (403).
 */
type Entry = { id: string; amount: number; date: string | null; note: string | null };
type Payment = { id: string; payee: string; amount: number; date: string | null; note: string | null };
type LedgerRow = { payee: string; percent: number; owed: number; paid: number; outstanding: number };
type Data = { entries: Entry[]; total: number; payments: Payment[]; ledger: LedgerRow[] };

const money = (n: number) => (n < 0 ? "-£" + Math.abs(n).toFixed(2) : "£" + n.toFixed(2));
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

export default function ReleaseRevenuePanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");

  // Revenue add form
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [addingRev, setAddingRev] = useState(false);

  // Payout add form
  const [payPayee, setPayPayee] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [addingPay, setAddingPay] = useState(false);

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

  const addRevenue = async () => {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt)) { toast.error("Enter an amount"); return; }
    setAddingRev(true);
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
      setAddingRev(false);
    }
  };

  const removeRevenue = async (id: string) => {
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

  const addPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!payPayee) { toast.error("Choose a payee"); return; }
    if (!Number.isFinite(amt)) { toast.error("Enter an amount"); return; }
    setAddingPay(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payee: payPayee, amount: amt, date: payDate || null }),
      });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setPayAmount(""); setPayDate("");
    } catch {
      toast.error("Couldn't record — you may not have permission.");
    } finally {
      setAddingPay(false);
    }
  };

  const removePayment = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/releases/${releaseId}/payments?paymentId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Couldn't remove — you may not have permission.");
    } finally {
      setBusyId(null);
    }
  };

  const inputCls = "rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none";

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <Banknote className="h-5 w-5 text-gray-400" /> Royalties
        </h2>
        <span className="text-sm tabular-nums text-gray-300">Revenue {money(data.total)}</span>
      </div>

      {/* Record income */}
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Record income</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative w-full sm:w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.00" aria-label="Amount"
            className={`${inputCls} w-full py-2 pl-6 pr-3 text-right tabular-nums`} />
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Source (DistroKid Q2, Bandcamp…)" aria-label="Note" className={`${inputCls} min-w-0 flex-1`} />
        <button type="button" onClick={addRevenue} disabled={addingRev || !amount.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50">
          {addingRev ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>
      {data.entries.length > 0 && (
        <ul className="mb-6 overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
          {data.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0">
              <span className="w-24 shrink-0 text-right text-sm tabular-nums text-gray-200">{money(e.amount)}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{[fmtDate(e.date), e.note].filter(Boolean).join(" · ") || "—"}</span>
              <button type="button" onClick={() => removeRevenue(e.id)} disabled={busyId === e.id} aria-label="Remove entry"
                className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-red-950/20 hover:text-red-400 disabled:opacity-50">
                {busyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Ledger */}
      {data.ledger.length > 0 ? (
        <>
          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-gray-500">Owed · paid · outstanding</p>
          <div className="mb-6 overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
            <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-gray-600">
              <span className="min-w-0 flex-1">Payee</span>
              <span className="w-20 shrink-0 text-right">Owed</span>
              <span className="w-20 shrink-0 text-right">Paid</span>
              <span className="w-24 shrink-0 text-right">Outstanding</span>
            </div>
            {data.ledger.map((r) => (
              <div key={r.payee} className="flex items-center gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{r.payee} <span className="text-xs text-gray-600">{r.percent}%</span></span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-gray-300">{money(r.owed)}</span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-gray-500">{money(r.paid)}</span>
                <span className={`w-24 shrink-0 text-right text-sm tabular-nums ${r.outstanding <= 0 ? "text-emerald-400" : "text-amber-400"}`}>{money(r.outstanding)}</span>
              </div>
            ))}
          </div>

          {/* Record payout */}
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Record payout</p>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <select value={payPayee} onChange={(e) => setPayPayee(e.target.value)} aria-label="Payee" className={`${inputCls} sm:w-48`}>
              <option value="">Choose payee…</option>
              {data.ledger.map((r) => <option key={r.payee} value={r.payee}>{r.payee}</option>)}
            </select>
            <div className="relative w-full sm:w-32">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">£</span>
              <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.00" aria-label="Payout amount"
                className={`${inputCls} w-full py-2 pl-6 pr-3 text-right tabular-nums`} />
            </div>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label="Payout date" className={inputCls} />
            <button type="button" onClick={addPayment} disabled={addingPay || !payPayee || !payAmount.trim()}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50">
              {addingPay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Record payout
            </button>
          </div>
          {data.payments.length > 0 && (
            <ul className="overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 border-b border-gray-800 px-4 py-2.5 last:border-b-0">
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{p.payee}</span>
                  <span className="shrink-0 text-xs text-gray-500">{fmtDate(p.date) ?? ""}</span>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums text-gray-300">{money(p.amount)}</span>
                  <button type="button" onClick={() => removePayment(p.id)} disabled={busyId === p.id} aria-label="Remove payout"
                    className="shrink-0 rounded p-1.5 text-gray-500 transition-colors hover:bg-red-950/20 hover:text-red-400 disabled:opacity-50">
                    {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-600">Add payees in Revenue splits above to see who&apos;s owed and record payouts.</p>
      )}
    </section>
  );
}
