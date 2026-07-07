"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { BookUser, Send, AlertCircle, TrendingUp, ChevronRight, Headphones, Award } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getCached, setCached } from "@/lib/admin-cache";

type Summary = {
  totalContacts: number;
  activePitches: number;
  awaitingFollowUp: number;
  acceptedPitches: number;
  totalDemos: number;
  newDemos: number;
  totalPlacements: number;
  combinedReach: number;
};

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export default function OutreachHubPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Live data: show the last summary instantly (no spinner on revisit), but
    // always revalidate in the background so the numbers stay current.
    const cached = getCached<Summary>("outreach-summary");
    if (cached) {
      setSummary(cached);
      setLoading(false);
    }
    fetch("/api/outreach/summary")
      .then((r) => r.json())
      .then((d) => {
        setSummary(d);
        setCached("outreach-summary", d);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const stat = (val: number | undefined) =>
    loading ? <Skeleton className="h-8 w-12" /> : <span>{val ?? 0}</span>;

  return (
    <div>
      <PageHeader
        title="Outreach"
        description="Contacts, pitches, demos and placements — everything for getting a release heard."
      />

      {/* Attention banner */}
      {!loading && summary && summary.awaitingFollowUp > 0 ? (
        <div className="mb-6">
          <Link
            href="/admin/outreach/pitches?status=sent"
            className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 transition-colors hover:bg-amber-500/15"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              <strong>{summary.awaitingFollowUp}</strong>{" "}
              {summary.awaitingFollowUp === 1 ? "pitch needs" : "pitches need"} a follow-up
            </span>
            <ChevronRight className="ml-auto h-4 w-4" />
          </Link>
        </div>
      ) : null}

      {/* Stats row */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Total contacts</p>
          <div className="mt-1 text-3xl font-semibold">{stat(summary?.totalContacts)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Active pitches</p>
          <div className="mt-1 text-3xl font-semibold">{stat(summary?.activePitches)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Accepted</p>
          <div className="mt-1 text-3xl font-semibold text-green-400">{stat(summary?.acceptedPitches)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Demos to review</p>
          <div className={`mt-1 text-3xl font-semibold ${!loading && summary?.newDemos ? "text-amber-400" : ""}`}>{stat(summary?.newDemos)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Placements</p>
          <div className="mt-1 text-3xl font-semibold">{stat(summary?.totalPlacements)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Combined reach</p>
          <div className="mt-1 text-3xl font-semibold">
            {loading ? <Skeleton className="h-8 w-14" /> : <span>{compact.format(summary?.combinedReach ?? 0)}</span>}
          </div>
        </div>
      </div>

      {/* Section cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/outreach/contacts"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border/80 hover:bg-white/[0.02]"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
              <BookUser className="h-5 w-5 text-muted-foreground" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="font-medium">Contacts</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Blogs, curators, radio, sync supervisors and influencers.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {loading ? <Skeleton className="h-3 w-20" /> : `${summary?.totalContacts ?? 0} contact${(summary?.totalContacts ?? 0) !== 1 ? "s" : ""}`}
          </div>
        </Link>

        <Link
          href="/admin/outreach/pitches"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border/80 hover:bg-white/[0.02]"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
              <Send className="h-5 w-5 text-muted-foreground" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="font-medium">Pitches</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Track every pitch sent per release and its outcome.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {loading ? <Skeleton className="h-3 w-20" /> : `${summary?.activePitches ?? 0} active`}
          </div>
        </Link>

        <Link
          href="/admin/outreach/demos"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border/80 hover:bg-white/[0.02]"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
              <Headphones className="h-5 w-5 text-muted-foreground" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="font-medium">Demos</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Inbound demos moving through the A&amp;R funnel.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {loading ? <Skeleton className="h-3 w-24" /> : `${summary?.newDemos ?? 0} to review · ${summary?.totalDemos ?? 0} total`}
          </div>
        </Link>

        <Link
          href="/admin/outreach/placements"
          className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-border/80 hover:bg-white/[0.02]"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background">
              <Award className="h-5 w-5 text-muted-foreground" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="font-medium">Placements</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Playlist adds, radio spins and press wins.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {loading ? <Skeleton className="h-3 w-24" /> : `${summary?.totalPlacements ?? 0} logged · ${compact.format(summary?.combinedReach ?? 0)} reach`}
          </div>
        </Link>
      </div>

      {/* Quick tips */}
      <div className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          How it works
        </div>
        <ol className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
          <li><span className="font-medium text-foreground">1.</span> Add PR contacts — blogs, curators, radio producers, sync supervisors.</li>
          <li><span className="font-medium text-foreground">2.</span> Log a pitch for each release you want to push to a contact.</li>
          <li><span className="font-medium text-foreground">3.</span> Track status from Not Sent → Sent → Followed Up → Accepted.</li>
          <li><span className="font-medium text-foreground">4.</span> When a pitch is accepted, convert it to a Press item directly from the pitch record.</li>
        </ol>
      </div>
    </div>
  );
}
