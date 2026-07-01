"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, CalendarClock, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/local-ui/Toast";
import { readError } from "@/lib/release-editor";
import type { ReleaseStatus } from "@/components/admin/release-editor/ReleaseDetailsPanel";

/**
 * Publish / schedule control for the tracklist step, so a release can go live (or
 * be scheduled) straight after its tracks are uploaded — no trip back to the
 * details page. It issues a status-only PATCH; the server re-validates the stored
 * cover/artist/date (see PATCH /api/releases/[releaseId]), so this stays a thin,
 * safe wrapper. Going live is gated on a saved, issue-free tracklist with no
 * uploads in flight (the same signals the tracklist surfaces to its parent).
 */
export interface PublishReleasePanelProps {
  releaseId: string;
  status: ReleaseStatus;
  /** Stored release date as yyyy-mm-dd (or null). Prefills the schedule input. */
  releaseDate: string | null;
  trackCount: number;
  /** Tracks with unresolved publish issues (name/audio/artist/ISRC). */
  issueCount: number;
  /** An upload or save is in flight — publishing mid-flight risks an empty/broken live release. */
  busy: boolean;
  /** Unsaved track edits pending (in-flight/failed save) — save before publishing. */
  unsaved: boolean;
  /** Reflect a status/date change back to the page (updates ISRC + autosave gating). */
  onChanged: (next: { status: ReleaseStatus; releaseDate: string | null }) => void;
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function PublishReleasePanel({
  releaseId,
  status,
  releaseDate,
  trackCount,
  issueCount,
  busy,
  unsaved,
  onChanged,
}: PublishReleasePanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [date, setDate] = useState(releaseDate ?? "");
  const [dateError, setDateError] = useState<string | null>(null);

  const isLive = status === "RELEASED" && trackCount >= 1;

  // Reasons the release can't go live yet — shown so the admin knows what to fix.
  const blockers: string[] = [];
  if (trackCount < 1) blockers.push("add at least one track");
  if (issueCount > 0)
    blockers.push(`resolve ${issueCount} track issue${issueCount === 1 ? "" : "s"}`);
  // busy (upload/save in flight) implies unsaved, so only surface one of them.
  if (busy) blockers.push("wait for uploads to finish");
  else if (unsaved) blockers.push("let track edits finish saving");

  const canGoLive = blockers.length === 0 && !saving;
  // Scheduling reveals no audio (Coming Soon), so it doesn't need tracks — only a
  // settled tracklist (no in-flight/broken saves) and a valid future date.
  const canSchedule = !busy && !unsaved && issueCount === 0 && !saving;

  const patchStatus = async (
    nextStatus: ReleaseStatus,
    nextReleaseDate?: string | null,
    navigateAway = true
  ) => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { status: nextStatus };
      if (nextReleaseDate !== undefined) body.releaseDate = nextReleaseDate;
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(await readError(res, "Update failed"));
        return;
      }
      onChanged({
        status: nextStatus,
        releaseDate: nextReleaseDate !== undefined ? nextReleaseDate : releaseDate,
      });
      if (nextStatus === "RELEASED") toast.success("Release is now live");
      else if (nextStatus === "SCHEDULED") toast.success("Release scheduled");
      else toast.success("Reverted to draft");
      if (navigateAway && nextStatus !== "DRAFT") {
        router.push(`/admin/catalog/release/${releaseId}`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const onSchedule = () => {
    if (!date || date <= todayStr()) {
      setDateError("Pick a future date for a Coming Soon release.");
      return;
    }
    setDateError(null);
    void patchStatus("SCHEDULED", date);
  };

  const statusLine = isLive
    ? "Live — visible on the site."
    : status === "RELEASED"
      ? "Released — hidden until it has at least one track."
      : status === "SCHEDULED"
        ? `Scheduled — goes live on ${prettyDate(releaseDate)}.`
        : "Draft — not visible to anyone yet.";

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-[#141414] p-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-200">
            {isLive ? "Release status" : "Ready to publish?"}
          </h3>
          <p className="mt-1 text-sm text-gray-400">{statusLine}</p>
        </div>
      </div>

      {/* What still needs doing before it can go live (hidden once ready/live). */}
      {!isLive && blockers.length > 0 ? (
        <p className="mt-3 text-sm text-amber-400">
          Before going live: {blockers.join(", ")}.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {status !== "RELEASED" ? (
          <Button
            type="button"
            onClick={() => void patchStatus("RELEASED")}
            disabled={!canGoLive}
            className="bg-white text-black hover:bg-gray-200"
            title={canGoLive ? "Make this release live now" : "Resolve the items above first"}
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="mr-2 h-4 w-4" />
            )}
            Publish now
          </Button>
        ) : null}

        {status !== "SCHEDULED" ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setScheduling((s) => !s)}
            disabled={saving}
            className="border-white/10 text-gray-300"
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            {scheduling ? "Cancel schedule" : "Schedule for later"}
          </Button>
        ) : null}

        {status !== "DRAFT" ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void patchStatus("DRAFT", undefined, false)}
            disabled={saving || busy || unsaved}
            className="text-gray-400 hover:text-gray-200"
            title="Hide this release again as a draft"
          >
            <Undo2 className="mr-2 h-4 w-4" />
            Revert to draft
          </Button>
        ) : null}
      </div>

      {/* Schedule date picker — revealed by "Schedule for later", or always shown
          while the release is already Scheduled so the date can be adjusted. */}
      {scheduling || status === "SCHEDULED" ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            {status === "SCHEDULED" ? "Scheduled release date" : "Release date (Coming Soon until then)"}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="date"
              min={todayStr()}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDateError(null);
              }}
              aria-invalid={dateError ? true : undefined}
              className={`w-auto bg-black/40 text-white [color-scheme:dark] ${
                dateError ? "border-red-500/70" : "border-white/10"
              }`}
            />
            <Button
              type="button"
              onClick={onSchedule}
              disabled={!canSchedule}
              className="bg-white text-black hover:bg-gray-200"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {status === "SCHEDULED" ? "Update date" : "Schedule release"}
            </Button>
          </div>
          {dateError ? <p className="mt-1 text-sm text-red-400">{dateError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
