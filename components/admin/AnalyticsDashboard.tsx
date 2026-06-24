"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Play,
  Users,
  Eye,
  MousePointerClick,
  TrendingUp,
  ExternalLink,
  Globe,
  Flame,
  AlertTriangle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AdminQuickSearch from "@/components/admin/AdminQuickSearch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import DeltaBadge from "@/components/admin/charts/DeltaBadge";
import Sparkline from "@/components/admin/charts/Sparkline";
import TrendArea from "@/components/admin/charts/TrendArea";

type Series = { date: string; count: number }[];

interface DashboardData {
  days: number;
  summary: {
    plays: number;
    listeners: number;
    reach: number;
    releaseViews: number;
    linkClicks: number;
    completedPlays: number;
    completionRate: number;
    totalUsers: number;
    anonPlays: number;
    newVisitors: number;
    returning: number;
    visits: number;
    pageViews: number;
    pagesPerVisit: number;
  };
  previous: { plays: number; listeners: number; releaseViews: number; linkClicks: number; visits: number };
  series: { plays: Series; views: Series; clicks: Series };
  topContent: Array<{ id: string; name: string; plays: number; artistName?: string }>;
  risingContent: Array<{ id: string; name: string; artistName?: string; plays: number; delta: number }>;
  topArtists: Array<{ name: string; plays: number; id: string | null }>;
  topPages: Array<{ name: string; count: number }>;
  campaigns: Array<{ name: string; visits: number; plays: number; clicks: number }>;
  demographics: {
    gender: Record<string, number>;
    ageRange: Record<string, number>;
  };
  geography: {
    topCountries: Array<{ name: string; count: number }>;
    topCities: Array<{ name: string; count: number }>;
  };
  recentPlays: Array<{
    id: string;
    userName: string;
    anonymous: boolean;
    contentType: string;
    contentName: string;
    artistName?: string;
    completed: boolean;
    createdAt: string;
  }>;
}

interface LinkClickData {
  summary: { totalClicks: number; uniqueTargets: number };
  byLinkType: Array<{ linkType: string; count: number }>;
  topLinks: Array<{ context: string; contextId: string; name: string; clicks: number; byType: Record<string, number> }>;
  ctrByRelease: Array<{ contextId: string; name: string; clicks: number; views: number; ctr: number | null }>;
}

interface ContentAnalytics {
  contentId: string;
  contentType: string;
  summary: { totalPlays: number; uniqueUsers: number; completedPlays: number; completionRate: number; averagePlayDuration: number };
  demographics: {
    gender: Record<string, number>;
    ageRange: Record<string, number>;
    topCountries: Array<{ country: string; count: number }>;
    topCities: Array<{ city: string; count: number }>;
  };
  userEngagement: Array<{
    userId: string | null;
    userName: string;
    userEmail: string;
    gender: string | null;
    ageRange: string | null;
    country: string | null;
    city: string | null;
    playDuration: number | null;
    completed: boolean;
    createdAt: string;
  }>;
}

const LINK_TYPE_LABELS: Record<string, string> = {
  spotify: "Spotify",
  appleMusic: "Apple Music",
  tidal: "Tidal",
  amazonMusic: "Amazon Music",
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  x: "X",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
};
const linkTypeLabel = (t: string) => LINK_TYPE_LABELS[t] || t;

const REGION = typeof Intl !== "undefined" && "DisplayNames" in Intl
  ? new Intl.DisplayNames(undefined, { type: "region" })
  : null;
const countryName = (code: string) => {
  if (code.length === 2 && REGION) {
    try {
      return REGION.of(code.toUpperCase()) || code;
    } catch {
      return code;
    }
  }
  return code;
};

type Metric = "plays" | "views" | "clicks";
const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "plays", label: "Plays", color: "var(--primary)" },
  { key: "views", label: "Release views", color: "var(--primary)" },
  { key: "clicks", label: "Link clicks", color: "var(--primary)" },
];

type ListRow = { label: string; value: number | string; sub?: string };
type Detail =
  | { kind: "series"; metric: Metric }
  | { kind: "listeners" }
  | { kind: "list"; title: string; rows: ListRow[] };

/** Small labelled progress bar used across the audience/top panels. */
function BarRow({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-foreground">{label}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${(value / (max || 1)) * 100}%`, backgroundColor: color }} />
      </div>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  current,
  previous,
  series,
  color,
  sub,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  current: number;
  previous: number;
  series?: number[];
  color: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="group rounded-xl border border-border bg-card p-6 text-left transition-colors enabled:cursor-pointer enabled:hover:border-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <DeltaBadge current={current} previous={previous} />
      </div>
      <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {onClick ? <ChevronRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" /> : null}
      </p>
      <p className="mt-1 text-3xl font-light tracking-tight tabular-nums text-foreground">{value.toLocaleString()}</p>
      {series && series.length > 1 ? (
        <div className="mt-3">
          <Sparkline data={series} color={color} width={180} height={32} className="w-full" />
        </div>
      ) : sub ? (
        <p className="mt-3 text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </button>
  );
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [ctr, setCtr] = useState<LinkClickData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<Metric>("plays");
  const [selectedContent, setSelectedContent] = useState<{ id: string; type: string; name: string } | null>(null);
  const [contentAnalytics, setContentAnalytics] = useState<ContentAnalytics | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const showList = (title: string, rows: ListRow[]) => setDetail({ kind: "list", title, rows });

  // Guard against out-of-order responses: a slow earlier request (e.g. 365D)
  // must not overwrite a newer one (e.g. 7D). Only the latest request commits.
  const reqRef = useRef(0);
  const fetchAll = useCallback(async () => {
    const myReq = ++reqRef.current;
    setIsLoading(true);
    try {
      const [d, c] = await Promise.all([
        fetch(`/api/analytics/dashboard?days=${days}`, { cache: "no-store" }),
        fetch(`/api/analytics/link-clicks?days=${days}`, { cache: "no-store" }),
      ]);
      if (!d.ok) throw new Error();
      const dj = await d.json();
      const cj = c.ok ? await c.json() : null;
      if (myReq !== reqRef.current) return; // superseded by a newer fetch
      setData(dj);
      if (cj) setCtr(cj);
      setError(null);
    } catch {
      if (myReq === reqRef.current) setError("Failed to fetch dashboard data");
    } finally {
      if (myReq === reqRef.current) setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleContentClick = async (contentId: string, contentType: string, contentName: string) => {
    setSelectedContent({ id: contentId, type: contentType, name: contentName });
    setContentAnalytics(null); // clear the previous item's stats while the new ones load
    setLoadingContent(true);
    try {
      const actualId = contentId.includes("-") ? contentId.split("-")[1] : contentId;
      const res = await fetch(`/api/analytics/content/${actualId}?type=${contentType}&days=${days}`);
      if (res.ok) setContentAnalytics(await res.json());
    } finally {
      setLoadingContent(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-9 w-9 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="py-20 text-center">
        <p className="mb-4 text-red-400">{error || "No data available"}</p>
        <Button onClick={fetchAll} variant="outline">Retry</Button>
      </div>
    );
  }

  const s = data.summary;
  const maxContent = Math.max(...data.topContent.map((c) => c.plays), 1);
  const maxCountry = Math.max(...data.geography.topCountries.map((c) => c.count), 1);
  const maxCity = Math.max(...data.geography.topCities.map((c) => c.count), 1);
  const maxPage = Math.max(...data.topPages.map((p) => p.count), 1);
  const leakingReleases = (ctr?.ctrByRelease || []).filter((r) => r.views > 0 && r.clicks === 0);
  const genderEntries = Object.entries(data.demographics.gender).filter(([, n]) => n > 0);
  const ageEntries = Object.entries(data.demographics.ageRange).filter(([, n]) => n > 0);
  const maxGender = Math.max(...genderEntries.map(([, n]) => n), 1);
  const maxAge = Math.max(...ageEntries.map(([, n]) => n), 1);
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const metricSeries = data.series[metric];

  const jumpArtists = data.topArtists.filter((a) => a.id).slice(0, 3);

  return (
    <div className="space-y-6 duration-500 animate-in fade-in">
      {/* Quick bar: search + jump-to artists + period */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <AdminQuickSearch />
          {jumpArtists.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Top artists:</span>
              {jumpArtists.map((a) => (
                <Link
                  key={a.id}
                  href={`/admin/catalog/artist/${a.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:border-white/25 hover:bg-white/[0.04]"
                >
                  {a.name}
                  <span className="text-muted-foreground">{a.plays}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/admin/data" className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground">
            Live &amp; raw data →
          </Link>
          <div className="flex gap-1">
            {[7, 30, 90, 365].map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
                className={days === d ? "bg-white text-black hover:bg-gray-200" : ""}
              >
                {d === 365 ? "1Y" : `${d}D`}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Play} label="Plays" value={s.plays} current={s.plays} previous={data.previous.plays} series={data.series.plays.map((p) => p.count)} color="var(--primary)" onClick={() => setDetail({ kind: "series", metric: "plays" })} />
        <KpiCard icon={Users} label="Unique listeners" value={s.listeners} current={s.listeners} previous={data.previous.listeners} color="var(--primary)" sub={`${s.reach.toLocaleString()} total reach · ${s.anonPlays.toLocaleString()} anon plays`} onClick={() => setDetail({ kind: "listeners" })} />
        <KpiCard icon={Eye} label="Release views" value={s.releaseViews} current={s.releaseViews} previous={data.previous.releaseViews} series={data.series.views.map((p) => p.count)} color="var(--primary)" onClick={() => setDetail({ kind: "series", metric: "views" })} />
        <KpiCard icon={MousePointerClick} label="Link clicks" value={s.linkClicks} current={s.linkClicks} previous={data.previous.linkClicks} series={data.series.clicks.map((p) => p.count)} color="var(--primary)" onClick={() => setDetail({ kind: "series", metric: "clicks" })} />
      </div>

      {/* Secondary stats — de-emphasised single row (supports the KPIs, doesn't compete) */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
        {[
          { label: "Visits", value: s.visits.toLocaleString() },
          { label: "Pages / visit", value: s.pagesPerVisit.toFixed(1) },
          { label: "Completion", value: `${s.completionRate.toFixed(0)}%` },
          { label: "New", value: s.newVisitors.toLocaleString() },
          { label: "Returning", value: s.returning.toLocaleString() },
          { label: "Members", value: s.totalUsers.toLocaleString() },
        ].map((x) => (
          <span key={x.label} className="inline-flex items-baseline gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{x.label}</span>
            <span className="text-sm tabular-nums text-foreground">{x.value}</span>
          </span>
        ))}
      </div>

      {/* Hero trend */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-medium text-foreground">Trend</h3>
          <div className="flex gap-1">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  metric === m.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <TrendArea data={metricSeries} color={activeMetric.color} valueLabel={activeMetric.label.toLowerCase()} />
        {metricSeries.filter((d) => d.count > 0).length < 3 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Limited data so far — the trend fills in as activity grows.
          </p>
        ) : null}
      </div>

      {/* What's working */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium text-foreground">Top content</h3>
            {data.topContent.length > 6 ? (
              <button
                type="button"
                onClick={() => showList("All top content", data.topContent.map((c) => ({ label: c.name, value: c.plays, sub: c.artistName })))}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all ({data.topContent.length})
              </button>
            ) : null}
          </div>
          <div className="space-y-3">
            {data.topContent.length > 0 ? (
              data.topContent.slice(0, 6).map((c) => {
                const [type] = c.id.includes("-") ? c.id.split("-") : ["single", c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleContentClick(c.id, type, c.name)}
                    className="block w-full rounded-lg p-1 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <BarRow label={c.name} value={c.plays} max={maxContent} color="var(--primary)" sub={c.artistName} />
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No plays in this period.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-medium text-foreground">
            <Flame className="h-4 w-4 text-muted-foreground" /> Rising
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">Biggest gains vs the previous {data.days} days.</p>
          <div className="space-y-3">
            {data.risingContent.length > 0 ? (
              data.risingContent.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{c.name}</p>
                    {c.artistName ? <p className="truncate text-xs text-muted-foreground">{c.artistName}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">{c.plays}</span>
                    <span className="inline-flex items-center gap-0.5 text-xs text-foreground">
                      <TrendingUp className="h-3 w-3" /> +{c.delta}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Not enough history to spot trends yet.</p>
            )}
          </div>

          {data.topArtists.length > 0 ? (
            <>
              <h4 className="mb-3 mt-6 text-sm font-medium text-muted-foreground">Top artists</h4>
              <div className="flex flex-wrap gap-2">
                {data.topArtists.slice(0, 8).map((a, i) => {
                  const cls = "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs";
                  const inner = (
                    <>
                      <span className="text-muted-foreground">#{i + 1}</span>
                      <span className="text-foreground">{a.name}</span>
                      <span className="text-muted-foreground">{a.plays}</span>
                    </>
                  );
                  return a.id ? (
                    <Link key={a.name} href={`/admin/catalog/artist/${a.id}`} className={`${cls} transition-colors hover:border-white/25 hover:bg-white/[0.04]`}>
                      {inner}
                    </Link>
                  ) : (
                    <span key={a.name} className={cls}>{inner}</span>
                  );
                })}
              </div>
              {data.topArtists.length > 8 ? (
                <button
                  type="button"
                  onClick={() => showList("All top artists", data.topArtists.map((a) => ({ label: a.name, value: a.plays })))}
                  className="mt-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  View all ({data.topArtists.length})
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Audience */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-foreground">
            <Globe className="h-4 w-4 text-muted-foreground" /> Where listeners are
          </h3>
          {data.geography.topCountries.length === 0 && data.geography.topCities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No location data yet (added as consented visitors listen).</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Countries</h4>
                {data.geography.topCountries.slice(0, 8).map((c) => (
                  <BarRow key={c.name} label={countryName(c.name)} value={c.count} max={maxCountry} color="var(--primary)" />
                ))}
                {data.geography.topCountries.length > 8 ? (
                  <button
                    type="button"
                    onClick={() => showList("All countries", data.geography.topCountries.map((c) => ({ label: countryName(c.name), value: c.count })))}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    View all ({data.geography.topCountries.length})
                  </button>
                ) : null}
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cities</h4>
                {data.geography.topCities.length > 0 ? (
                  data.geography.topCities.slice(0, 8).map((c) => (
                    <BarRow key={c.name} label={c.name} value={c.count} max={maxCity} color="var(--primary)" />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
                {data.geography.topCities.length > 8 ? (
                  <button
                    type="button"
                    onClick={() => showList("All cities", data.geography.topCities.map((c) => ({ label: c.name, value: c.count })))}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    View all ({data.geography.topCities.length})
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="mb-4 text-lg font-medium text-foreground">Who&apos;s listening</h3>
          <p className="mb-4 text-xs text-muted-foreground">From signed-in members&apos; profiles.</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gender</h4>
              {genderEntries.map(([g, n]) => (
                <BarRow key={g} label={g.replace(/_/g, " ")} value={n} max={maxGender} color="var(--primary)" />
              ))}
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Age</h4>
              {ageEntries.map(([a, n]) => (
                <BarRow key={a} label={a === "unknown" ? "Unknown" : a} value={n} max={maxAge} color="var(--primary)" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Traffic: top pages + campaigns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-medium text-foreground">Top pages</h3>
            {data.topPages.length > 8 ? (
              <button
                type="button"
                onClick={() => showList("All pages", data.topPages.map((p) => ({ label: p.name, value: p.count })))}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all ({data.topPages.length})
              </button>
            ) : null}
          </div>
          {data.topPages.length > 0 ? (
            <div className="space-y-3">
              {data.topPages.slice(0, 8).map((p) => (
                <BarRow key={p.name} label={p.name} value={p.count} max={maxPage} color="var(--primary)" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No page views yet — they start collecting as consented visitors browse.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-lg font-medium text-foreground">Campaigns</h3>
            {data.campaigns.length > 8 ? (
              <button
                type="button"
                onClick={() => showList("All campaigns", data.campaigns.map((c) => ({ label: c.name, value: `${c.visits} visits`, sub: `${c.plays} plays · ${c.clicks} clicks` })))}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all ({data.campaigns.length})
              </button>
            ) : null}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Visits, plays &amp; clicks credited to <code className="text-foreground">utm_campaign</code> link tags.
          </p>
          {data.campaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left text-sm font-medium text-muted-foreground">Campaign</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-muted-foreground">Visits</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-muted-foreground">Plays</th>
                    <th className="px-2 py-2 text-right text-sm font-medium text-muted-foreground">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.slice(0, 8).map((c) => (
                    <tr key={c.name} className="border-b border-border">
                      <td className="px-2 py-2.5 text-sm text-foreground">{c.name}</td>
                      <td className="px-2 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{c.visits}</td>
                      <td className="px-2 py-2.5 text-right text-sm tabular-nums text-foreground">{c.plays}</td>
                      <td className="px-2 py-2.5 text-right text-sm tabular-nums text-foreground">{c.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No campaign traffic yet. Add <code className="text-foreground">?utm_campaign=spring-drop</code> (plus
              optional <code className="text-foreground">utm_source</code>/<code className="text-foreground">utm_medium</code>)
              to the links you share, and attributed visits will show here.
            </p>
          )}
        </div>
      </div>

      {/* Conversion */}
      {ctr ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-5 w-5 text-amber-400" />
            <h2 className="text-xl font-light tracking-tight text-foreground">Conversion — outbound clicks</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-medium text-foreground">By platform</h3>
              {ctr.byLinkType.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const m = Math.max(...ctr.byLinkType.map((t) => t.count), 1);
                    return ctr.byLinkType.map((t) => (
                      <BarRow key={t.linkType} label={linkTypeLabel(t.linkType)} value={t.count} max={m} color="var(--primary)" />
                    ));
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No link clicks recorded yet.</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-medium text-foreground">Most-clicked</h3>
              {ctr.topLinks.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const m = Math.max(...ctr.topLinks.map((l) => l.clicks), 1);
                    return ctr.topLinks.map((l) => (
                      <div key={`${l.context}-${l.contextId}`} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate text-sm text-foreground">{l.name}</span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{l.clicks}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${(l.clicks / m) * 100}%`, backgroundColor: "var(--primary)" }} />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No link clicks recorded yet.</p>
              )}
            </div>
          </div>

          {leakingReleases.length > 0 ? (
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-1 flex items-center gap-2 text-lg font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" /> Views but no clicks
              </h3>
              <p className="mb-4 text-xs text-muted-foreground">
                These releases got page views but zero outbound streaming-link clicks this
                period — likely leaking conversion (missing/broken links or weak calls to action).
              </p>
              <div className="flex flex-wrap gap-2">
                {leakingReleases.map((r) => (
                  <span key={r.contextId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
                    <span className="text-foreground">{r.name}</span>
                    <span className="text-muted-foreground">{r.views} views · 0 clicks</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="mb-1 text-lg font-medium text-foreground">Release click-through rate</h3>
            <p className="mb-4 text-xs text-muted-foreground">Outbound streaming-link clicks vs release-page views in this period.</p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Release</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-muted-foreground">Views</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-muted-foreground">Clicks</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-muted-foreground">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {ctr.ctrByRelease.length > 0 ? (
                    ctr.ctrByRelease.map((r) => (
                      <tr key={r.contextId} className="border-b border-border hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-sm text-foreground">{r.name}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{r.views}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums text-foreground">{r.clicks}</td>
                        <td className="px-4 py-2.5 text-right text-sm tabular-nums">
                          {r.ctr === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={r.ctr >= 100 ? "text-foreground" : "text-muted-foreground"}>{r.ctr.toFixed(0)}%</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No release link clicks recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* Recent activity */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-medium text-foreground">Recent plays</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Listener</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Content</th>
                <th className="hidden px-4 py-2 text-left text-sm font-medium text-muted-foreground sm:table-cell">Artist</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPlays.filter((p) => p.contentType !== "release").slice(0, 20).map((p) => (
                <tr key={p.id} className="border-b border-border hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">
                    {p.anonymous ? <span className="text-muted-foreground/80">Anonymous</span> : p.userName}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-foreground">{p.contentName}</td>
                  <td className="hidden px-4 py-2.5 text-sm text-muted-foreground sm:table-cell">{p.artistName || "—"}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={p.completed ? "success" : "warning"}>{p.completed ? "Completed" : "Partial"}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {data.recentPlays.filter((p) => p.contentType !== "release").length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No recent plays.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Content detail dialog */}
      <Dialog open={!!selectedContent} onOpenChange={(open) => !open && setSelectedContent(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle>{selectedContent?.name}</DialogTitle>
            <DialogDescription>Detailed analytics for this {selectedContent?.type}.</DialogDescription>
          </DialogHeader>
          {loadingContent ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : contentAnalytics ? (
            <div className="mt-2 space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { l: "Plays", v: contentAnalytics.summary.totalPlays.toLocaleString() },
                  { l: "Unique", v: contentAnalytics.summary.uniqueUsers.toLocaleString() },
                  { l: "Completion", v: `${contentAnalytics.summary.completionRate.toFixed(0)}%` },
                  {
                    l: "Avg duration",
                    v: `${Math.floor(contentAnalytics.summary.averagePlayDuration / 60)}:${(contentAnalytics.summary.averagePlayDuration % 60).toString().padStart(2, "0")}`,
                  },
                ].map((x) => (
                  <div key={x.l} className="rounded-lg border border-border bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">{x.l}</p>
                    <p className="text-xl font-light tabular-nums">{x.v}</p>
                  </div>
                ))}
              </div>

              {(contentAnalytics.demographics.topCountries.length > 0 || contentAnalytics.demographics.topCities.length > 0) ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {contentAnalytics.demographics.topCountries.length > 0 ? (
                    <div className="rounded-lg border border-border p-4">
                      <h4 className="mb-3 text-sm font-medium text-muted-foreground">Top countries</h4>
                      <div className="space-y-2">
                        {contentAnalytics.demographics.topCountries.map((c) => (
                          <div key={c.country} className="flex justify-between text-sm">
                            <span className="text-foreground">{countryName(c.country)}</span>
                            <span className="tabular-nums text-muted-foreground">{c.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {contentAnalytics.demographics.topCities.length > 0 ? (
                    <div className="rounded-lg border border-border p-4">
                      <h4 className="mb-3 text-sm font-medium text-muted-foreground">Top cities</h4>
                      <div className="space-y-2">
                        {contentAnalytics.demographics.topCities.map((c) => (
                          <div key={c.city} className="flex justify-between text-sm">
                            <span className="text-foreground">{c.city}</span>
                            <span className="tabular-nums text-muted-foreground">{c.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-lg border border-border p-4">
                <h4 className="mb-3 text-sm font-medium text-muted-foreground">Recent engagement</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2 pr-3 text-left font-medium">Listener</th>
                        <th className="py-2 pr-3 text-left font-medium">Location</th>
                        <th className="py-2 pr-3 text-left font-medium">Status</th>
                        <th className="py-2 text-left font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contentAnalytics.userEngagement.slice(0, 20).map((e, i) => {
                        const loc = e.city && e.country ? `${e.city}, ${countryName(e.country)}` : e.country ? countryName(e.country) : e.city || "—";
                        return (
                          <tr key={`${e.userId || "anon"}-${e.createdAt}-${i}`} className="border-b border-border">
                            <td className="py-2 pr-3 text-foreground">{e.userName}</td>
                            <td className="py-2 pr-3 text-muted-foreground">{loc}</td>
                            <td className="py-2 pr-3">
                              <Badge variant={e.completed ? "success" : "warning"}>{e.completed ? "Done" : "Partial"}</Badge>
                            </td>
                            <td className="py-2 text-muted-foreground">{new Date(e.createdAt).toLocaleDateString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">No analytics data available.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Per-metric / list detail */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[85vh] w-[95vw] max-w-2xl overflow-y-auto border-border bg-card text-foreground">
          {detail?.kind === "series"
            ? (() => {
                const m = METRICS.find((x) => x.key === detail.metric)!;
                const series = data.series[detail.metric];
                const total = series.reduce((acc, d) => acc + d.count, 0);
                const avg = series.length ? total / series.length : 0;
                const peak = series.reduce((mx, d) => (d.count > mx.count ? d : mx), series[0] || { date: "", count: 0 });
                // List only days that had activity — over a 30/90/365-day window
                // the zero rows are just noise. Totals above still span the period.
                const active = series.filter((d) => d.count > 0);
                const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>{m.label} — full breakdown</DialogTitle>
                      <DialogDescription>Days with {m.label.toLowerCase()} in the selected {data.days}-day period.</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { l: "Total", v: total.toLocaleString() },
                        { l: "Avg / day", v: avg.toFixed(1) },
                        { l: "Peak", v: `${peak.count}` },
                      ].map((x) => (
                        <div key={x.l} className="rounded-lg border border-border bg-background/40 p-3">
                          <p className="text-xs text-muted-foreground">{x.l}</p>
                          <p className="text-xl font-light tabular-nums">{x.v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-card">
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="px-3 py-2 text-left font-medium">Date</th>
                            <th className="px-3 py-2 text-right font-medium">{m.label}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {active.length ? (
                            [...active].reverse().map((d) => (
                              <tr key={d.date} className="border-b border-border">
                                <td className="px-3 py-1.5 text-muted-foreground">{fmt(d.date)}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{d.count.toLocaleString()}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={2} className="px-3 py-8 text-center text-muted-foreground">
                                No {m.label.toLowerCase()} recorded in this period.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()
            : detail?.kind === "listeners"
              ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Audience — full breakdown</DialogTitle>
                    <DialogDescription>Everyone who engaged in the selected period.</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      { l: "Total reach", v: s.reach },
                      { l: "Unique listeners", v: s.listeners },
                      { l: "New", v: s.newVisitors },
                      { l: "Returning", v: s.returning },
                      { l: "Anonymous plays", v: s.anonPlays },
                      { l: "Registered members", v: s.totalUsers },
                    ].map((x) => (
                      <div key={x.l} className="rounded-lg border border-border bg-background/40 p-3">
                        <p className="text-xs text-muted-foreground">{x.l}</p>
                        <p className="text-xl font-light tabular-nums">{x.v.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  {data.geography.topCountries.length > 0 ? (
                    <div className="mt-4">
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">All countries</h4>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                        {data.geography.topCountries.map((c) => (
                          <div key={c.name} className="flex justify-between text-sm">
                            <span className="truncate text-foreground">{countryName(c.name)}</span>
                            <span className="tabular-nums text-muted-foreground">{c.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">Gender</h4>
                      {genderEntries.length ? genderEntries.map(([g, n]) => (
                        <div key={g} className="flex justify-between text-sm">
                          <span className="capitalize text-foreground">{g.replace(/_/g, " ")}</span>
                          <span className="tabular-nums text-muted-foreground">{n}</span>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">—</p>}
                    </div>
                    <div>
                      <h4 className="mb-2 text-sm font-medium text-muted-foreground">Age</h4>
                      {ageEntries.length ? ageEntries.map(([a, n]) => (
                        <div key={a} className="flex justify-between text-sm">
                          <span className="text-foreground">{a === "unknown" ? "Unknown" : a}</span>
                          <span className="tabular-nums text-muted-foreground">{n}</span>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">—</p>}
                    </div>
                  </div>
                </>
              )
              : detail?.kind === "list"
                ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>{detail.title}</DialogTitle>
                    </DialogHeader>
                    <ol className="mt-2 max-h-[60vh] divide-y divide-border overflow-y-auto">
                      {detail.rows.map((r, i) => (
                        <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-3 py-2">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-foreground">{r.label}</span>
                              {r.sub ? <span className="block truncate text-xs text-muted-foreground">{r.sub}</span> : null}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{r.value}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )
                : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
