"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  computeArtistSeo,
  computeArtistGkp,
  assessNameAmbiguity,
  type ScoreComponent,
  type ArtistSeoGrade,
} from "@/lib/seo-score";

/**
 * Live, per-section discoverability breakdown shown in the artist editor sidebar.
 * Mirrors the roster's SEO + GKP badges, but spelled out signal-by-signal so the
 * admin can see exactly what each field contributes (and what to fill next) as
 * they type. Pure/derived from the current form values — no fetching.
 */

export interface ArtistScoreSignals {
  hasPhoto: boolean;
  bioLength: number;
  genreCount: number;
  linkCount: number;
  hasMusicBrainz: boolean;
  hasIsni: boolean;
  hasWikidata: boolean;
  hasWikipedia: boolean;
  releaseCount: number;
}

const GRADE_BADGE: Record<ArtistSeoGrade, "success" | "warning" | "destructive"> = {
  strong: "success",
  good: "warning",
  weak: "destructive",
};

const DOT: Record<ScoreComponent["status"], string> = {
  full: "bg-green-500",
  partial: "bg-amber-500",
  none: "bg-red-500/60",
};

function ScoreSection({
  title,
  score,
  grade,
  components,
  isniGuideHref,
}: {
  title: string;
  score: number;
  grade: ArtistSeoGrade;
  components: ScoreComponent[];
  isniGuideHref: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Badge variant={GRADE_BADGE[grade]} className="tabular-nums">
          {score}/100
        </Badge>
      </div>
      <ul className="mt-2 space-y-1">
        {components.map((c) => (
          <li key={c.key} className="flex items-center gap-2 text-[11px] leading-5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
            <span className={c.status === "full" ? "text-foreground" : "text-muted-foreground"}>
              {c.label}
            </span>
            {c.key === "isni" && c.status !== "full" ? (
              <Link
                href={isniGuideHref}
                className="text-blue-400 underline hover:text-blue-300"
              >
                how to claim
              </Link>
            ) : null}
            <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/80">
              {c.earned}/{c.max}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ArtistScorePanel({
  signals,
  name = "",
  isniGuideHref = "/admin/guides/isni",
}: {
  signals: ArtistScoreSignals;
  name?: string;
  isniGuideHref?: string;
}) {
  const seo = computeArtistSeo(signals);
  const gkp = computeArtistGkp(signals);
  const ambiguity = assessNameAmbiguity(name);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Discoverability</h3>
        <span className="text-[11px] text-muted-foreground">updates live</span>
      </div>

      <ScoreSection
        title="Search (SEO)"
        score={seo.score}
        grade={seo.grade}
        components={seo.components}
        isniGuideHref={isniGuideHref}
      />

      <div className="border-t border-border" />

      <ScoreSection
        title="Knowledge Panel"
        score={gkp.score}
        grade={gkp.grade}
        components={gkp.components}
        isniGuideHref={isniGuideHref}
      />

      {/* Advisory only — name distinctiveness is a real panel factor but not a
          fillable field, so it's flagged here rather than scored. */}
      {ambiguity.level !== "low" ? (
        <div
          className={`rounded-lg border p-2.5 text-[11px] leading-snug ${
            ambiguity.level === "high"
              ? "border-amber-500/40 bg-amber-500/[0.06] text-amber-200/90"
              : "border-border bg-white/[0.02] text-muted-foreground"
          }`}
        >
          <span className="font-medium text-foreground">
            Name difficulty: {ambiguity.level === "high" ? "high" : "moderate"}
          </span>
          <p className="mt-0.5">{ambiguity.note}</p>
        </div>
      ) : null}
    </div>
  );
}
