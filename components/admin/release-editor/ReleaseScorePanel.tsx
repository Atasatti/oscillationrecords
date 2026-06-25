"use client";

import { Badge } from "@/components/ui/badge";
import {
  computeReleaseSeo,
  type ReleaseSeoSignals,
  type ScoreComponent,
  type ReleaseSeoGrade,
} from "@/lib/seo-score";

/**
 * Live SEO breakdown for the release editor sidebar — the release counterpart of
 * the artist editor's Discoverability panel. Releases earn rich results
 * (schema.org MusicAlbum), not a Knowledge Panel, so there's a single Search
 * (SEO) score, signal-by-signal. Pure/derived from the current form values.
 */

const GRADE_BADGE: Record<ReleaseSeoGrade, "success" | "warning" | "destructive"> = {
  strong: "success",
  good: "warning",
  weak: "destructive",
};

const DOT: Record<ScoreComponent["status"], string> = {
  full: "bg-green-500",
  partial: "bg-amber-500",
  none: "bg-red-500/60",
};

export default function ReleaseScorePanel({ signals }: { signals: ReleaseSeoSignals }) {
  const seo = computeReleaseSeo(signals);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Discoverability</h3>
        <span className="text-[11px] text-muted-foreground">updates live</span>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium">Search (SEO)</h4>
          <Badge variant={GRADE_BADGE[seo.grade]} className="tabular-nums">
            {seo.score}/100
          </Badge>
        </div>
        <ul className="mt-2 space-y-1">
          {seo.components.map((c) => (
            <li key={c.key} className="flex items-center gap-2 text-[11px] leading-5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
              <span className={c.status === "full" ? "text-foreground" : "text-muted-foreground"}>
                {c.label}
              </span>
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/80">
                {c.earned}/{c.max}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
