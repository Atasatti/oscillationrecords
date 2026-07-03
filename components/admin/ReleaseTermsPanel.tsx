"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { AGREEMENT_TYPES, AGREEMENT_TYPE_LABELS, type TermsRecord } from "@/lib/release-terms";

/**
 * Licensing / deal terms for a release — type, territory, rights, term dates and
 * notes. Given the label's non-exclusive model, records what each release is
 * licensed under. Sits with the money panels on the release editor. Hides itself
 * if the viewer can't read the release (403).
 */
const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function expiryHint(endDate: string): { text: string; cls: string } {
  const days = Math.ceil((new Date(endDate + "T00:00:00Z").getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Expired ${fmtDate(endDate)}`, cls: "text-red-400" };
  if (days === 0) return { text: `Ends today (${fmtDate(endDate)})`, cls: "text-amber-400" };
  if (days <= 30) return { text: `Ends ${fmtDate(endDate)} · in ${days} day${days === 1 ? "" : "s"}`, cls: "text-amber-400" };
  return { text: `Ends ${fmtDate(endDate)}`, cls: "text-gray-500" };
}

export default function ReleaseTermsPanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [saving, setSaving] = useState(false);

  const [type, setType] = useState<string>("");
  const [territory, setTerritory] = useState("");
  const [rights, setRights] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const fill = (t: TermsRecord) => {
    setType(t.type ?? "");
    setTerritory(t.territory ?? "");
    setRights(t.rights ?? "");
    setStartDate(t.startDate ?? "");
    setEndDate(t.endDate ?? "");
    setNotes(t.notes ?? "");
  };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/terms`);
      if (!r.ok) throw new Error("hidden");
      const j = await r.json();
      fill(j.terms as TermsRecord);
      setState("ok");
    } catch {
      setState("hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  if (state !== "ok") return null;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/terms`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: type || null, territory, rights, startDate, endDate, notes }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      fill(j.terms as TermsRecord);
      toast.success("Terms saved");
    } catch {
      toast.error("Couldn't save — you may not have permission.");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  const hint = endDate ? expiryHint(endDate) : null;

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ScrollText className="h-5 w-5 text-gray-400" /> Agreement terms
        </h2>
        {hint ? <span className={`text-sm ${hint.cls}`}>{hint.text}</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Licence type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Licence type" className={`${inputCls} w-full`}>
            <option value="">Not set</option>
            {AGREEMENT_TYPES.map((t) => <option key={t} value={t}>{AGREEMENT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Territory</label>
          <input value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="Worldwide, UK & EU…" className={`${inputCls} w-full`} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Rights granted</label>
          <input value={rights} onChange={(e) => setRights(e.target.value)} placeholder="e.g. Distribution + sync, digital only…" className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Term start</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div>
          <label className={labelCls}>Term end</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputCls} w-full`} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Split summary, contract reference, special conditions…" className={`${inputCls} w-full resize-none`} />
        </div>
      </div>

      <div className="mt-3">
        <button type="button" onClick={save} disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save terms
        </button>
      </div>
    </section>
  );
}
