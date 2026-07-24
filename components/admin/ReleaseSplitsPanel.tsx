"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/local-ui/Toast";
import { releaseEditHref } from "@/lib/release-workflow";
import SplitEditor from "@/components/admin/SplitEditor";
import {
  splitsToRows,
  rowsToSplits,
  splitsProblem,
  type SplitRow,
  type Split,
} from "@/lib/release-splits";

/**
 * Per-release royalty split editor — the contributing artists and their percentage
 * shares (should total 100%). Reference only: the site tracks no money/payouts
 * (Ditto pays artists directly). Loads via the catalog-read splits API; saving
 * needs catalog:write (a 403 hides the panel / reverts with a toast).
 */
type TrackSplitSummary = {
  trackId: string;
  trackName: string;
  splits: Split[];
  total: number;
  balanced: boolean;
};

export default function ReleaseSplitsPanel({
  releaseId,
  active,
}: {
  releaseId: string;
  /** True while this panel's workflow step is the visible one. The workflow
   *  keeps every step mounted, so without this a split edited on the Tracks
   *  step mid-session would never appear here until a full page reload. */
  active?: boolean;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [trackSplits, setTrackSplits] = useState<TrackSplitSummary[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/releases/${releaseId}/splits`);
      if (!r.ok) throw new Error("hidden");
      const d = await r.json();
      setRows(splitsToRows((d.splits ?? []) as Split[]));
      setTrackSplits((d.trackSplits ?? []) as TrackSplitSummary[]);
      setState("ok");
      setDirty(false);
    } catch {
      setState("hidden");
    }
  }, [releaseId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-load when the step becomes visible — but never clobber unsaved edits.
  useEffect(() => {
    if (active && !dirtyRef.current) load();
  }, [active, load]);

  if (state !== "ok") return null;

  const onChange = (next: SplitRow[]) => {
    setRows(next);
    setDirty(true);
  };

  // Live validity — drives the inline message and disables Save while the
  // allocation is invalid (over/under 100%, duplicate artists).
  const liveProblem = rows.length > 0 ? splitsProblem(rowsToSplits(rows)) : null;

  const save = async () => {
    // Instant feedback before the round-trip: the server enforces the same rule
    // (empty, or exactly 100%), so this only changes WHEN the admin hears it.
    const splits = rowsToSplits(rows);
    const problem = splitsProblem(splits);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/splits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ splits }),
      });
      if (!res.ok) {
        // Surface the server's actual reason (unbalanced total, unknown artist,
        // permission) — the old blanket "you may not have permission" hid real
        // validation failures behind the wrong explanation.
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Couldn't save the split.");
      }
      toast.success("Split saved");
      setDirty(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the split.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-12">
      <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
        <Coins className="h-5 w-5 text-gray-400" /> Royalty split
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        The contributing artists and their agreed shares (should total 100%). Add them
        from your roster so each one&apos;s real name and contact come from — and are
        saved back to — their artist profile. Reference only — the label doesn&apos;t
        manage payments here (Ditto pays artists directly).
      </p>

      <SplitEditor value={rows} onChange={onChange} disabled={saving} linkWriteBack />

      {liveProblem ? (
        <p className="mt-2 text-sm text-amber-400/90">{liveProblem}</p>
      ) : null}

      {trackSplits.length > 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-foreground">Per-track splits</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length === 0
              ? "There's no release-wide split, but these tracks carry their own — the agreement isn't missing, it lives on the tracks:"
              : "These tracks override the release-wide split above:"}
          </p>
          <ul className="mt-3 space-y-2">
            {trackSplits.map((t) => (
              <li key={t.trackId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-medium text-foreground">{t.trackName}</span>
                <span className="text-muted-foreground">
                  {t.splits.map((sp) => `${sp.name} ${sp.percent}%`).join(" · ")}
                </span>
                <span className={`tabular-nums text-xs ${t.balanced ? "text-emerald-400" : "text-amber-400"}`}>
                  {t.total}%{t.balanced ? "" : " — unbalanced"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Edit these on each track&apos;s <span className="text-foreground">Credits &amp; splits</span>{" "}
            section in{" "}
            <Link href={releaseEditHref(releaseId, "tracks")} className="text-foreground underline hover:text-white">
              Step 2 — Tracks
            </Link>
            .
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <button
          type="button"
          onClick={save}
          title={liveProblem ?? undefined}
          disabled={saving || !dirty || !!liveProblem}
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save split
        </button>
      </div>
    </section>
  );
}
