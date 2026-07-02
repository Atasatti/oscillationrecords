"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle, Check, ClipboardCheck, Loader2, BadgeCheck } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import type { ReleaseReadinessResult, DeliveryChecklistResult } from "@/lib/release-readiness";

/**
 * "Is this release ready to publish?" — two parts:
 *  1. Metadata readiness (DERIVED, read-only): artwork, tracks, UPC/ISRC, date…
 *  2. Delivery checklist (PERSISTED, toggleable): delivered, live on DSPs, signed
 *     off, … — ticked by staff with catalog:write.
 * Hides itself if the viewer lacks catalog access (403 on load).
 */
type Data = { metadata: ReleaseReadinessResult; delivery: DeliveryChecklistResult };

export default function ReleaseReadinessPanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/readiness`);
      if (r.status === 403) throw new Error("hidden");
      if (!r.ok) throw new Error("failed");
      setData(await r.json());
      setState("ok");
    } catch (e) {
      setState(e instanceof Error && e.message === "hidden" ? "hidden" : "hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string, done: boolean) => {
    if (!data) return;
    setBusy(key);
    // Optimistic update.
    const steps = data.delivery.steps.map((s) => (s.key === key ? { ...s, done } : s));
    setData({
      ...data,
      delivery: {
        steps,
        total: data.delivery.total,
        doneCount: steps.filter((s) => s.done).length,
        signedOff: key === "signedOff" ? done : data.delivery.signedOff,
      },
    });
    try {
      const res = await fetch(`/api/releases/${releaseId}/readiness`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, done }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData((prev) => (prev ? { ...prev, delivery: d.delivery } : prev));
    } catch {
      toast.error("Couldn't update — you may not have permission.");
      load(); // revert to server truth
    } finally {
      setBusy(null);
    }
  };

  if (state !== "ok" || !data) return null;

  const m = data.metadata;
  const d = data.delivery;
  const mPct = Math.round((m.doneCount / m.total) * 100);
  const dPct = Math.round((d.doneCount / d.total) * 100);

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ClipboardCheck className="h-5 w-5 text-gray-400" /> Release readiness
        </h2>
        {d.signedOff ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
            <BadgeCheck className="h-3.5 w-3.5" /> Signed off
          </span>
        ) : null}
      </div>

      {/* Metadata readiness — derived, read-only. */}
      <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
        <span>Metadata</span>
        <span>{m.doneCount}/{m.total}{m.ready ? " · ready" : ""}</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${m.ready ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${mPct}%` }} />
      </div>
      <ul className="mb-6 grid gap-px overflow-hidden rounded-xl border border-gray-800 bg-gray-800 sm:grid-cols-2">
        {m.items.map((it) => (
          <li key={it.key} className="flex items-start gap-2.5 bg-[#0F0F0F] px-4 py-3">
            {it.done
              ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" />}
            <div className="min-w-0">
              <p className={`text-sm ${it.done ? "text-gray-400" : "text-gray-200"}`}>{it.label}</p>
              {!it.done && it.detail ? <p className="mt-0.5 text-xs text-amber-400/80">{it.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>

      {/* Delivery checklist — persisted, toggleable. */}
      <div className="mb-3 flex items-center justify-between text-xs text-gray-500">
        <span>Delivery checklist</span>
        <span>{d.doneCount}/{d.total} done</span>
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${dPct}%` }} />
      </div>
      <ul className="overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
        {d.steps.map((s) => {
          const isSignOff = s.key === "signedOff";
          return (
            <li key={s.key} className="border-b border-gray-800 last:border-b-0">
              <button
                type="button"
                onClick={() => toggle(s.key, !s.done)}
                disabled={busy === s.key}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] disabled:opacity-60"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    s.done ? "border-emerald-500 bg-emerald-500 text-black" : "border-gray-600"
                  }`}
                >
                  {busy === s.key ? <Loader2 className="h-3 w-3 animate-spin" /> : s.done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </span>
                <span className={`flex-1 text-sm ${s.done ? "text-gray-400" : "text-gray-200"} ${isSignOff ? "font-medium" : ""}`}>
                  {s.label}
                </span>
                {isSignOff ? <BadgeCheck className={`h-4 w-4 shrink-0 ${s.done ? "text-emerald-400" : "text-gray-600"}`} /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
