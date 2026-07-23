"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ReleaseEditor, { type ReleaseKind } from "@/components/admin/release-editor/ReleaseEditor";
import { ReleaseStepNav } from "@/components/admin/release-editor/ReleaseWorkflow";

function toKind(value: string | null): ReleaseKind {
  const v = (value || "").toLowerCase();
  return v === "album" ? "ALBUM" : v === "ep" ? "EP" : "SINGLE";
}

function toStatus(
  value: string | null
): "DRAFT" | "SCHEDULED" | "RELEASED" | undefined {
  const v = (value || "").toUpperCase();
  return v === "DRAFT" || v === "SCHEDULED" || v === "RELEASED" ? v : undefined;
}

// Prefill primary artists: `artistIds` (comma-separated, from the multi-select
// New-release dialog) with a fallback to the legacy single `artistId`.
function toArtistIds(params: URLSearchParams): string[] | undefined {
  const multi = params.get("artistIds");
  if (multi) {
    const ids = multi.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length) return ids;
  }
  const single = params.get("artistId");
  return single ? [single] : undefined;
}

function NewReleaseInner() {
  const params = useSearchParams();
  return (
    <>
      {/* The same 5-step strip as the edit workflow, so creating reads as step 1
          of ONE flow rather than a separate page that later morphs into "Edit".
          Steps 2–5 are disabled (there's no release id until "Next" creates the
          draft); the editor then lands in the real workflow at step 2. */}
      <ReleaseStepNav active={1} />
      <ReleaseEditor
        mode="create"
        releaseKind={toKind(params.get("kind"))}
        initialArtistIds={toArtistIds(new URLSearchParams(params.toString()))}
        initialStatus={toStatus(params.get("status"))}
      />
    </>
  );
}

export default function NewReleasePage() {
  return (
    <Suspense fallback={null}>
      <NewReleaseInner />
    </Suspense>
  );
}
