"use client";

import { useCallback, useEffect, useState } from "react";
import { Truck, Loader2, Check } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import {
  DELIVERY_STAGES,
  DELIVERY_STAGE_LABELS,
  DELIVERY_STAGE_HINTS,
  type DeliveryRecord,
  type DeliveryStage,
} from "@/lib/release-delivery";

/**
 * Delivery / sign-off status for a release — the operational "is it out yet"
 * workflow (Not started → Ready → Delivered → Live), separate from the metadata
 * SEO score. Sits with the release-ops panels on the editor; hides itself if the
 * viewer can't read the release (403).
 */
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ReleaseDeliveryPanel({ releaseId }: { releaseId: string }) {
  const toast = useToast();
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [rec, setRec] = useState<DeliveryRecord | null>(null);
  const [notes, setNotes] = useState("");
  const [savingStage, setSavingStage] = useState<DeliveryStage | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);

  const apply = (d: DeliveryRecord) => { setRec(d); setNotes(d.notes ?? ""); };

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/delivery`);
      if (!r.ok) throw new Error("hidden");
      const j = await r.json();
      apply(j.delivery as DeliveryRecord);
      setState("ok");
    } catch {
      setState("hidden");
    }
  }, [releaseId]);

  useEffect(() => { load(); }, [load]);

  if (state !== "ok" || !rec) return null;

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch(`/api/releases/${releaseId}/delivery`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const j = await res.json();
    apply(j.delivery as DeliveryRecord);
    return true;
  };

  const setStage = async (stage: DeliveryStage) => {
    if (savingStage || stage === rec.status) return;
    setSavingStage(stage);
    const ok = await patch({ status: stage });
    if (!ok) toast.error("Couldn't update — you may not have permission.");
    setSavingStage(null);
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    const ok = await patch({ notes });
    if (ok) toast.success("Delivery notes saved");
    else toast.error("Couldn't save — you may not have permission.");
    setSavingNotes(false);
  };

  const currentIdx = DELIVERY_STAGES.indexOf(rec.status);
  const inputCls =
    "rounded-md border border-gray-700 bg-[#0F0F0F] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-gray-500 focus:outline-none";
  const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <Truck className="h-5 w-5 text-gray-400" /> Delivery &amp; sign-off
        </h2>
        {rec.updatedAt ? (
          <span className="text-sm text-gray-500">
            Updated {fmtWhen(rec.updatedAt)}{rec.updatedBy ? ` · ${rec.updatedBy}` : ""}
          </span>
        ) : null}
      </div>

      {/* Stage stepper */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DELIVERY_STAGES.map((stage, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const busy = savingStage === stage;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => setStage(stage)}
              disabled={!!savingStage}
              aria-current={current ? "step" : undefined}
              className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                current
                  ? "border-white bg-white/10"
                  : done
                  ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
                  : "border-gray-700 hover:border-gray-500"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : (
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${current ? "bg-white text-black" : "bg-gray-700 text-gray-300"}`}>{i + 1}</span>
                )}
                {DELIVERY_STAGE_LABELS[stage]}
              </span>
              <span className="text-xs text-gray-500">{DELIVERY_STAGE_HINTS[stage]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <label className={labelCls}>Delivery notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Distributor, delivery reference, DSP confirmation dates…"
          className={`${inputCls} w-full resize-none`}
        />
        <div className="mt-3">
          <button type="button" onClick={saveNotes} disabled={savingNotes || notes === (rec.notes ?? "")}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50">
            {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save notes
          </button>
        </div>
      </div>
    </section>
  );
}
