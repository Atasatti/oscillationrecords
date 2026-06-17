"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Play,
  Users,
  Eye,
  MousePointerClick,
  TrendingUp,
  ExternalLink,
  Globe,
  Flame,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  };
  previous: { plays: number; listeners: number; releaseViews: number; linkClicks: number };
  series: { plays: Series; views: Series; clicks: Series };
  topContent: Array<{ id: string; name: string; plays: number; artistName?: string }>;
  risingContent: Array<{ id: string; name: string; artistName?: string; plays: number; delta: number }>;
  topArtists: Array<{ name: string; plays: number }>;
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
  { key: "plays", label: "Plays", color: "var(--chart-1)" },
  { key: "views", label: "Release views", color: "var(--chart-2)" },
  { key: "clicks", label: "Link clicks", color: "var(--chart-3)" },
];

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
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  current: number;
  previous: number;
  series?: number[];
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/5" style={{ color }}>
          <Icon className="h-4 w-4" />
        </span>
        <DeltaBadge current={current} previous={previous} />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-3xl font-light tabular-nums text-foreground">{value.toLocaleString()}</p>
      {series && series.length > 1 ? (
        <div className="mt-3">
          <Sparkline data={series} color={color} width={180} height={32} className="w-full" />
        </div>
      ) : sub ? (
        <p className="mt-3 text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
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

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [d, c] = await Promise.all([
        fetch(`/api/analytics/dashboard?days=${days}`, { cache: "no-store" }),
        fetch(`/api/analytics/link-clicks?days=${days}`, { cache: "no-store" }),
      ]);
      if (!d.ok) throw new Error();
      setData(await d.json());
      if (c.ok) setCtr(await c.json());
      setError(null);
    } catch {
      setError("Failed to fetch dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleContentClick = async (contentId: string, contentType: string, contentName: string) => {
    setSelectedContent({ id: contentId, type: contentType, name: contentName });
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
  const genderEntries = Object.entries(data.demographics.gender).filter(([, n]) => n > 0);
  const ageEntries = Object.entries(data.demographics.ageRange).filter(([, n]) => n > 0);
  const maxGender = Math.max(...genderEntries.map(([, n]) => n), 1);
  const maxAge = Math.max(...ageEntries.map(([, n]) => n), 1);
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  const metricSeries = data.series[metric];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-end gap-1">
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

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Play} label="Plays" value={s.plays} current={s.plays} previous={data.previous.plays} series={data.series.plays.map((p) => p.count)} color="var(--chart-1)" />
        <KpiCard icon={Users} label="Unique listeners" value={s.listeners} current={s.listeners} previous={data.previous.listeners} color="var(--chart-4)" sub={`${s.reach.toLocaleString()} total reach · ${s.anonPlays.toLocaleString()} anon plays`} />
        <KpiCard icon={Eye} label="Release views" value={s.releaseViews} current={s.releaseViews} previous={data.previous.releaseViews} series={data.series.views.map((p) => p.count)} color="var(--chart-2)" />
        <KpiCard icon={MousePointerClick} label="Link clicks" value={s.linkClicks} current={s.linkClicks} previous={data.previous.linkClicks} series={data.series.clicks.map((p) => p.count)} color="var(--chart-3)" />
      </div>

      {/* Secondary stat strip */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Completion rate", value: `${s.completionRate.toFixed(0)}%` },
          { label: "New listeners", value: s.newVisitors.toLocaleString() },
          { label: "Returning", value: s.returning.toLocaleString() },
          { label: "Registered members", value: s.totalUsers.toLocaleString() },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <p className="mt-0.5 text-xl font-light tabular-nums text-foreground">{x.value}</p>
          </div>
        ))}
      </div>

      {/* Hero trend */}
      <div className="rounded-xl border border-border bg-card p-5">
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
      </div>

      {/* What's working */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-lg font-medium text-foreground">Top content</h3>
          <div className="space-y-3">
            {data.topContent.length > 0 ? (
              data.topContent.map((c) => {
                const [type] = c.id.includes("-") ? c.id.split("-") : ["single", c.id];
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleContentClick(c.id, type, c.name)}
                    className="block w-full rounded-lg p-1 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <BarRow label={c.name} value={c.plays} max={maxContent} color="var(--chart-1)" sub={c.artistName} />
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No plays in this period.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-1 flex items-center gap-2 text-lg font-medium text-foreground">
            <Flame className="h-4 w-4 text-amber-400" /> Rising
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
                    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-400">
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
                {data.topArtists.slice(0, 8).map((a, i) => (
                  <span key={a.name} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs">
                    <span className="text-muted-foreground">#{i + 1}</span>
                    <span className="text-foreground">{a.name}</span>
                    <span className="text-muted-foreground">{a.plays}</span>
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Audience */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-foreground">
            <Globe className="h-4 w-4 text-muted-foreground" /> Where listeners are
          </h3>
          {data.geography.topCountries.length === 0 && data.geography.topCities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No location data yet (added as consented visitors listen).</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Countries</h4>
                {data.geography.topCountries.map((c) => (
                  <BarRow key={c.name} label={countryName(c.name)} value={c.count} max={maxCountry} color="var(--chart-2)" />
                ))}
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cities</h4>
                {data.geography.topCities.length > 0 ? (
                  data.geography.topCities.map((c) => (
                    <BarRow key={c.name} label={c.name} value={c.count} max={maxCity} color="var(--chart-4)" />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 text-lg font-medium text-foreground">Who&apos;s listening</h3>
          <p className="mb-4 text-xs text-muted-foreground">From signed-in members&apos; profiles.</p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gender</h4>
              {genderEntries.map(([g, n]) => (
                <BarRow key={g} label={g.replace(/_/g, " ")} value={n} max={maxGender} color="var(--chart-1)" />
              ))}
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Age</h4>
              {ageEntries.map(([a, n]) => (
                <BarRow key={a} label={a === "unknown" ? "Unknown" : a} value={n} max={maxAge} color="var(--chart-3)" />
              ))}
            </div>
          </div>
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
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-4 text-lg font-medium text-foreground">By platform</h3>
              {ctr.byLinkType.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const m = Math.max(...ctr.byLinkType.map((t) => t.count), 1);
                    return ctr.byLinkType.map((t) => (
                      <BarRow key={t.linkType} label={linkTypeLabel(t.linkType)} value={t.count} max={m} color="var(--chart-3)" />
                    ));
                  })()}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No link clicks recorded yet.</p>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
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
                          <div className="h-full rounded-full" style={{ width: `${(l.clicks / m) * 100}%`, backgroundColor: "var(--chart-3)" }} />
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

          <div className="rounded-xl border border-border bg-card p-5">
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
                            <span className={r.ctr >= 100 ? "text-emerald-400" : "text-amber-400"}>{r.ctr.toFixed(0)}%</span>
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
      <div className="rounded-xl border border-border bg-card p-5">
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
    </div>
  );
}
