"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Plus, Trash2, Loader2, Save } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

/**
 * Per-release revenue splits editor (who's owed what share) on the release detail
 * page. A tracking aid, not accounting. Loads via the catalog-read splits API;
 * saving needs catalog:write (a 403 reverts with a toast). Hides itself if the
 * viewer can't read the release (403 on load).
 */
type Row = { payee: string; percent: string };

export default function ReleaseSplitsPanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/splits`);
      if (r.status === 403) throw new Error("hidden");
      if (!r.ok) throw new Error("failed");
      const d = await r.json();
      setRows((d.splits ?? []).map((s: { payee: string; percent: number }) => ({ payee: s.payee, percent: String(s.percent) })));
      setState("ok");
      setDirty(false);
    } catch (e) {
      setState(e instanceof Error && e.message === "hidden" ? "hidden" : "hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  if (state !== "ok") return null;

  const total = Math.round(rows.reduce((a, r) => a + (parseFloat(r.percent) || 0), 0) * 100) / 100;
  const remaining = Math.round((100 - total) * 100) / 100;

  const update = (i: number, field: keyof Row, v: string) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
    setDirty(true);
  };
  const add = () => { setRows((prev) => [...prev, { payee: "", percent: "" }]); setDirty(true); };
  const remove = (i: number) => { setRows((prev) => prev.filter((_, idx) => idx !== i)); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const payload = rows
        .filter((r) => r.payee.trim())
        .map((r) => ({ payee: r.payee.trim(), percent: parseFloat(r.percent) || 0 }));
      const res = await fetch(`/api/releases/${releaseId}/splits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splits: payload }),
      });
      if (!res.ok) throw new Error();
      toast.success("Splits saved");
      setDirty(false);
      load();
    } catch {
      toast.error("Couldn't save — you may not have permission.");
    } finally {
      setSaving(false);
    }
  };

  const totalColor = total === 100 ? "text-emerald-400" : total > 100 ? "text-red-400" : "text-amber-400";

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <Coins className="h-5 w-5 text-gray-400" /> Revenue splits
        </h2>
        <span className={`text-sm tabular-nums ${totalColor}`}>
          {total}%
          {total === 100 ? " · balanced" : total > 100 ? ` · over by ${Math.abs(remaining)}%` : ` · ${remaining}% unallocated`}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">
            No splits set. Add each payee and their share of this release&apos;s income.
          </p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-2.5">
                <input
                  value={r.payee}
                  onChange={(e) => update(i, "payee", e.target.value)}
                  placeholder="Payee (artist, producer, label…)"
                  aria-label="Payee"
                  className="min-w-0 flex-1 rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none"
                />
                <div className="relative w-24 shrink-0">
                  <input
                    value={r.percent}
                    onChange={(e) => update(i, "percent", e.target.value.replace(/[^0-9.]/g, ""))}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Percent"
                    className="w-full rounded-md border border-gray-700 bg-[#0F0F0F] py-2 pl-3 pr-7 text-right text-sm tabular-nums text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove payee"
                  className="shrink-0 rounded p-2 text-gray-500 transition-colors hover:bg-red-950/20 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          <Plus className="h-4 w-4" /> Add payee
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save splits
        </button>
      </div>
    </section>
  );
}
