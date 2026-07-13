"use client";

import { useCallback, useEffect, useState } from "react";
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
  type StepStatus,
  type WorkflowRelease,
} from "@/lib/release-workflow";

const STEPS = [
  { n: 1, label: "Release details" },
  { n: 2, label: "Tracks" },
  { n: 3, label: "Campaign budget" },
  { n: 4, label: "Documents" },
  { n: 5, label: "Money & outreach" },
] as const;

const EMPTY_STATUSES: Record<number, StepStatus> = { 1: "empty", 2: "empty", 3: "empty", 4: "empty", 5: "empty" };

/**
 * Step-based release edit workflow. Splits the (formerly one long page) release
 * editor into 5 navigable steps with per-section save and a readiness indicator on
 * each step (grey / red / amber / green). Every step's panel stays mounted (hidden
 * when inactive) so free navigation between steps never discards an unsaved edit;
 * each panel keeps its own Save button. Step statuses refresh on mount and each
 * time you switch steps, so the indicators reflect edits on the step you left.
 */
export default function ReleaseWorkflow({ releaseId }: { releaseId: string }) {
  const [active, setActive] = useState(1);
  const [statuses, setStatuses] = useState<Record<number, StepStatus>>(EMPTY_STATUSES);

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
  }, [refreshStatuses, active]);

  return (
    <div>
      <nav
        aria-label="Release sections"
        className="sticky top-0 z-20 -mx-4 mb-8 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8"
      >
        <ol className="flex gap-1.5 overflow-x-auto pb-0.5">
          {STEPS.map((s) => {
            const st = statuses[s.n] ?? "empty";
            const isActive = active === s.n;
            return (
              <li key={s.n} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setActive(s.n)}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "border-white/25 bg-white/10 text-white"
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

      <div className={active === 1 ? "" : "hidden"}>
        <ReleaseEditor mode="edit" releaseKind="SINGLE" releaseId={releaseId} inStepper />
        <div className="mt-16">
          <ReleaseDeliveryPanel releaseId={releaseId} />
          <LinkedTasksPanel releaseId={releaseId} />
        </div>
      </div>
      <div className={active === 2 ? "" : "hidden"}>
        <ReleaseTracksStep releaseId={releaseId} />
      </div>
      <div className={active === 3 ? "" : "hidden"}>
        <ReleaseBudgetPanel releaseId={releaseId} />
      </div>
      <div className={active === 4 ? "" : "hidden"}>
        <ReleaseTermsPanel releaseId={releaseId} />
      </div>
      <div className={active === 5 ? "" : "hidden"}>
        <ReleaseSplitsPanel releaseId={releaseId} />
        <LinkedPitchesPanel releaseId={releaseId} />
        <LinkedPressPanel releaseId={releaseId} />
      </div>
    </div>
  );
}
