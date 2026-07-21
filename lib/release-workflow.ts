// Step-based release editor: per-step readiness status for the workflow nav.
// Pure — computes each step's status from the data the panels already load, so the
// stepper can colour its indicators (grey = not started, red = needs attention,
// amber = incomplete, green = complete). No server-only imports.

import { isUsableFileUrl } from "@/lib/asset";

export type StepStatus = "empty" | "error" | "warning" | "complete";

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  empty: "Not started",
  error: "Needs attention",
  warning: "Incomplete",
  complete: "Complete",
};

/** Tailwind background for the status dot. */
export const STEP_STATUS_DOT: Record<StepStatus, string> = {
  empty: "bg-gray-600",
  error: "bg-red-500",
  warning: "bg-amber-400",
  complete: "bg-emerald-500",
};

// Deep-linkable step identity for the release editor (?step=<slug>). Lets other
// admin areas open a release straight at the relevant step — e.g. the Budget list
// links to ?step=budget instead of dumping the admin on step 1. Keep in sync with
// the STEPS array in ReleaseWorkflow.tsx.
export const RELEASE_STEP_BY_SLUG = {
  details: 1,
  tracks: 2,
  budget: 3,
  documents: 4,
  money: 5,
} as const;
export type ReleaseStepSlug = keyof typeof RELEASE_STEP_BY_SLUG;
export const RELEASE_STEP_SLUG_BY_N: Record<number, ReleaseStepSlug> = {
  1: "details",
  2: "tracks",
  3: "budget",
  4: "documents",
  5: "money",
};

/** Deep link to a release editor step, e.g. releaseEditHref(id, "budget"). */
export function releaseEditHref(releaseId: string, step?: ReleaseStepSlug): string {
  const base = `/admin/releases/${releaseId}/edit`;
  return step ? `${base}?step=${step}` : base;
}

export type WorkflowRelease = {
  name?: string | null;
  status?: string | null;
  coverImage?: string | null;
  releaseDate?: string | null;
  primaryArtistIds?: string[] | null;
  tracks?: Array<{ audioFile?: string | null; isrcCode?: string | null }> | null;
};

/** Step 1 — release details. Red if a required field is missing (name / primary
 *  artist); amber if valid but not fully ready (no artwork, no release date, or
 *  still a draft); green when it's complete and published/scheduled. */
export function detailsStatus(r: WorkflowRelease | null): StepStatus {
  if (!r) return "empty";
  const hasName = !!(r.name && r.name.trim());
  const hasArtist = (r.primaryArtistIds?.length ?? 0) > 0;
  if (!hasName || !hasArtist) return "error";
  const hasCover = isUsableFileUrl(r.coverImage);
  const hasDate = !!(r.releaseDate && String(r.releaseDate).trim());
  const published = r.status === "RELEASED" || r.status === "SCHEDULED";
  if (!hasCover || !hasDate || !published) return "warning";
  return "complete";
}

/** Step 2 — tracks. Grey with no tracks; red if any track has no audio (it can't
 *  ship); amber if audio's there but an ISRC is missing; green when complete. */
export function tracksStatus(r: WorkflowRelease | null): StepStatus {
  const tracks = r?.tracks ?? [];
  if (tracks.length === 0) return "empty";
  if (tracks.some((t) => !(t.audioFile && String(t.audioFile).trim()))) return "error";
  if (tracks.some((t) => !(t.isrcCode && String(t.isrcCode).trim()))) return "warning";
  return "complete";
}

/** Step 3 — budget. Green once a budget target is set, else not started. */
export function budgetStatus(spend: { budget?: number | null } | null): StepStatus {
  return spend && spend.budget != null ? "complete" : "empty";
}

/** Step 4 — documents / agreements. Green once an actual agreement document is
 *  attached; amber if only the manual terms are filled; grey if nothing. */
export function docsStatus(
  terms:
    | { documents?: unknown[] | null; type?: unknown; territory?: unknown; rights?: unknown; startDate?: unknown; endDate?: unknown; notes?: unknown }
    | null
): StepStatus {
  if (!terms) return "empty";
  if (Array.isArray(terms.documents) && terms.documents.length > 0) return "complete";
  if (terms.type || terms.territory || terms.rights || terms.startDate || terms.endDate || terms.notes) return "warning";
  return "empty";
}

/** Step 5 — money & outreach (royalty splits). Green when shares total 100%; red
 *  if they exceed it; amber if partial; grey if none set. */
export function moneyStatus(splits: Array<{ percent?: number }> | null): StepStatus {
  const arr = splits ?? [];
  if (arr.length === 0) return "empty";
  const total = arr.reduce((n, s) => n + (typeof s.percent === "number" ? s.percent : 0), 0);
  if (total > 100.01) return "error";
  if (Math.abs(total - 100) < 0.5) return "complete";
  return "warning";
}
