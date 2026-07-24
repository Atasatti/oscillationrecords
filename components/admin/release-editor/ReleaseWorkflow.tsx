"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ReleaseEditor from "@/components/admin/release-editor/ReleaseEditor";
import ReleaseTracksStep from "@/components/admin/release-editor/ReleaseTracksStep";
import ReleaseDeliveryPanel from "@/components/admin/ReleaseDeliveryPanel";
import ReleaseSplitsPanel from "@/components/admin/ReleaseSplitsPanel";
import ReleaseBudgetPanel from "@/components/admin/ReleaseBudgetPanel";
import ReleaseTermsPanel from "@/components/admin/ReleaseTermsPanel";
import LinkedTasksPanel from "@/components/admin/LinkedTasksPanel";
import LinkedPitchesPanel from "@/components/admin/LinkedPitchesPanel";
import LinkedPressPanel from "@/components/admin/LinkedPressPanel";
import {
  detailsStatus,
  tracksStatus,
  budgetStatus,
  docsStatus,
  moneyStatus,
  STEP_STATUS_DOT,
  STEP_STATUS_LABEL,
  RELEASE_STEP_BY_SLUG,
  RELEASE_STEP_SLUG_BY_N,
  type StepStatus,
  type WorkflowRelease,
} from "@/lib/release-workflow";

const STEPS = [
  { n: 1, label: "Release details" },
  { n: 2, label: "Tracks" },
  { n: 3, label: "Budget" },
  { n: 4, label: "Documents" },
  { n: 5, label: "Money & outreach" },
] as const;

/** Resolve the active step number from a ?step=<slug> value (defaults to 1). */
function stepFromParam(slug: string | null): number {
  return (slug && RELEASE_STEP_BY_SLUG[slug as keyof typeof RELEASE_STEP_BY_SLUG]) || 1;
}

const EMPTY_STATUSES: Record<number, StepStatus> = { 1: "empty", 2: "empty", 3: "empty", 4: "empty", 5: "empty" };

/**
 * The 5-step navigation strip, shared between the edit workflow (interactive)
 * and the CREATE page (static). On create there is no release id yet, so steps
 * 2–5 have nothing to open — omit `onSelect` and they render disabled with an
 * explanatory tooltip. Rendering the same strip in both places is what makes
 * "New" read as step 1 of the workflow instead of a separate flow.
 */
export function ReleaseStepNav({
  active,
  statuses = EMPTY_STATUSES,
  onSelect,
}: {
  active: number;
  statuses?: Record<number, StepStatus>;
  /** Step click handler. Omitted → steps other than `active` are disabled. */
  onSelect?: (n: number) => void;
}) {
  return (
    <nav
      aria-label="Release sections"
      className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8"
    >
      <ol className="flex flex-wrap gap-1.5">
        {STEPS.map((s) => {
          const st = statuses[s.n] ?? "empty";
          const isActive = active === s.n;
          const disabled = !onSelect && !isActive;
          return (
            <li key={s.n} className="shrink-0">
              <button
                type="button"
                onClick={onSelect ? () => onSelect(s.n) : undefined}
                disabled={disabled}
                title={disabled ? "Available once the release is created" : undefined}
                aria-current={isActive ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-white/25 bg-white/10 text-white"
                    : disabled
                      ? "cursor-not-allowed border-transparent text-muted-foreground/50"
                      : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                    isActive ? "bg-white text-black" : "bg-white/10 text-gray-300"
                  }`}
                >
                  {s.n}
                </span>
                <span className="whitespace-nowrap font-medium">{s.label}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${STEP_STATUS_DOT[st]}`} aria-hidden />
                <span className="sr-only">— {STEP_STATUS_LABEL[st]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Step-based release edit workflow. Splits the (formerly one long page) release
 * editor into 5 navigable steps with per-section save and a readiness indicator on
 * each step (grey / red / amber / green). Every step's panel stays mounted (hidden
 * when inactive) so free navigation between steps never discards an unsaved edit;
 * each panel keeps its own Save button. Step statuses refresh on mount and each
 * time you switch steps, so the indicators reflect edits on the step you left.
 */
export default function ReleaseWorkflow({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  // ?focus=<what> says which part of the target step to unfold on arrival. Read
  // once on mount: it describes how you got here, so switching steps by hand
  // afterwards shouldn't keep re-applying it.
  const [focusParam] = useState(() => searchParams.get("focus"));

  // The active step is driven by ?step=<slug> so a deep link (e.g. the Budget list
  // → ?step=budget) opens the right step and a refresh keeps it. Initialised from
  // the URL, then kept in sync both ways below.
  const [active, setActive] = useState(() => stepFromParam(stepParam));
  const [statuses, setStatuses] = useState<Record<number, StepStatus>>(EMPTY_STATUSES);
  // The Tracks step hosts the full (heavy, autosaving) tracklist editor. Mount it
  // lazily on first visit rather than in the background on step 1.
  const [tracksMounted, setTracksMounted] = useState(false);

  const refreshStatuses = useCallback(async () => {
    const jsonOr = async (p: Promise<Response>): Promise<unknown> => {
      try {
        const r = await p;
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };
    const [releaseRaw, spendRaw, termsRaw, splitsRaw] = await Promise.all([
      jsonOr(fetch(`/api/releases/${releaseId}`)),
      jsonOr(fetch(`/api/releases/${releaseId}/spend`)),
      jsonOr(fetch(`/api/releases/${releaseId}/terms`)),
      jsonOr(fetch(`/api/releases/${releaseId}/splits`)),
    ]);
    const release = releaseRaw as WorkflowRelease | null;
    const spend = spendRaw as { budget?: number | null } | null;
    const terms = (termsRaw as { terms?: Parameters<typeof docsStatus>[0] } | null)?.terms ?? null;
    const splits = (splitsRaw as { splits?: Parameters<typeof moneyStatus>[0] } | null)?.splits ?? null;
    setStatuses({
      1: detailsStatus(release),
      2: tracksStatus(release),
      3: budgetStatus(spend),
      4: docsStatus(terms),
      5: moneyStatus(splits),
    });
  }, [releaseId]);

  // Refresh on mount and on every step change, so an edit made on the step you're
  // leaving is reflected in its indicator.
  useEffect(() => {
    refreshStatuses();
    if (active === 2) setTracksMounted(true);
  }, [refreshStatuses, active]);

  // Keep the URL in sync when a step is picked (so a refresh stays on it), and
  // follow the URL when it changes underneath us (a deep link to this same page
  // from another area, or browser back/forward).
  useEffect(() => {
    const fromUrl = stepFromParam(stepParam);
    if (fromUrl !== active) setActive(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepParam]);

  const selectStep = useCallback(
    (n: number) => {
      setActive(n);
      const params = new URLSearchParams(searchParams.toString());
      params.set("step", RELEASE_STEP_SLUG_BY_N[n] ?? "details");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [searchParams, pathname, router]
  );

  return (
    <div>
      <ReleaseStepNav active={active} statuses={statuses} onSelect={selectStep} />

      <div className={active === 1 ? "" : "hidden"}>
        <ReleaseEditor mode="edit" releaseKind="SINGLE" releaseId={releaseId} inStepper />
        <div className="mt-16">
          <ReleaseDeliveryPanel releaseId={releaseId} />
          <LinkedTasksPanel releaseId={releaseId} />
        </div>
      </div>
      <div className={active === 2 ? "" : "hidden"}>
        {tracksMounted ? (
          <ReleaseTracksStep releaseId={releaseId} focusLyrics={focusParam === "lyrics"} />
        ) : null}
      </div>
      <div className={active === 3 ? "" : "hidden"}>
        <ReleaseBudgetPanel releaseId={releaseId} />
      </div>
      <div className={active === 4 ? "" : "hidden"}>
        <ReleaseTermsPanel releaseId={releaseId} />
      </div>
      <div className={active === 5 ? "" : "hidden"}>
        <ReleaseSplitsPanel releaseId={releaseId} active={active === 5} />
        <LinkedPitchesPanel releaseId={releaseId} />
        <LinkedPressPanel releaseId={releaseId} />
      </div>
    </div>
  );
}
