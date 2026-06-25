"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { getCached, setCached } from "@/lib/admin-cache";

interface RawData {
  now: string;
  focus?: { metric: string; date?: string; linkType?: string; contextId?: string } | null;
  counts: Record<string, number>;
  live: {
    activeSessions: number;
    items: Array<{ key: string; who: string; lastPath: string | null; country: string | null; city: string | null; secondsAgo: number }>;
  };
  recentVisits: Array<{ key: string; who: string; lastPath: string; pages: number; country: string | null; city: string | null; lastAt: string }>;
  recentPlays: Array<{ id: string; contentType: string; contentName: string; artistName: string | null; completed: boolean; country: string | null; city: string | null; session: string | null; who: string; createdAt: string }>;
  recentClicks: Array<{ id: string; context: string; contextName: string | null; linkType: string; session: string | null; visitor: string | null; createdAt: string }>;
  recentSignups: Array<{ id: string; name: string | null; email: string; createdAt: string }>;
  recentSubscribers: Array<{ email: string; createdAt: string }>;
}

const COUNT_LABELS: Record<string, string> = {
  users: "Users",
  profiles: "Profiles",
  artists: "Artists",
  releases: "Releases",
  tracks: "Tracks",
  playEvents: "Play events",
  pageViews: "Page views",
  linkClicks: "Link clicks",
  subscribers: "Subscribers",
};

const ago = (s: number) => (s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`);
const loc = (country: string | null, city: string | null) => (city && country ? `${city}, ${country}` : country || city || "—");
const when = (iso: string) => new Date(iso).toLocaleString();

function Section({
  title,
  hint,
  children,
  id,
  highlight,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  id?: string;
  highlight?: boolean;
}) {
  return (
    <div
      id={id}
      className={`rounded-xl border bg-card p-6 ${
        highlight ? "border-primary/50 ring-2 ring-primary/30" : "border-border"
      }`}
    >
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      {hint ? <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="max-h-[26rem] overflow-auto scroll-themed">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="sticky top-0 bg-card px-2 py-2 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const td = "px-2 py-1.5 text-foreground";
const tdm = "px-2 py-1.5 text-muted-foreground";

export default function RawDataPage() {
  const [data, setData] = useState<RawData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Optional day focus (from the dashboard Plays breakdown → /admin/data?date=…):
  // narrows the recent-plays list to that UTC day and highlights the section.
  const [focus, setFocus] = useState<{
    metric: string;
    date?: string;
    linkType?: string;
    contextId?: string;
  } | null>(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const date = p.get("date");
    const linkType = p.get("linkType");
    const contextId = p.get("contextId");
    const mp = p.get("metric");
    const metric = mp === "views" || mp === "clicks" ? mp : "plays";
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFocus({ metric, date });
    } else if (linkType) {
      setFocus({ metric: "clicks", linkType });
    } else if (contextId) {
      setFocus({ metric: "clicks", contextId });
    }
  }, []);

  const load = useCallback(async () => {
    const query = focus
      ? "?" +
        new URLSearchParams(
          focus.linkType
            ? { metric: "clicks", linkType: focus.linkType }
            : focus.contextId
              ? { metric: "clicks", contextId: focus.contextId }
              : { metric: focus.metric, date: focus.date ?? "" }
        ).toString()
      : "";
    // Live data: show the last snapshot instantly on revisit (no spinner), then
    // always revalidate — the page also self-refreshes on an interval.
    const cacheKey = `raw${query}`;
    const cached = getCached<RawData>(cacheKey);
    if (cached) {
      setData(cached);
      setError(false);
      setLoading(false);
    }
    try {
      const res = await fetch(`/api/analytics/raw${query}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const json = await res.json();
      // Defensive: guarantee every array/object the UI reads exists, so a partial
      // or unexpected response can never white-screen the page (`.length`/`.map`
      // on undefined — this surfaced in the error log as a /admin/data TypeError).
      const next: RawData = {
        now: json.now,
        focus: json.focus ?? null,
        counts: json.counts ?? {},
        live: { activeSessions: json.live?.activeSessions ?? 0, items: json.live?.items ?? [] },
        recentVisits: json.recentVisits ?? [],
        recentPlays: json.recentPlays ?? [],
        recentClicks: json.recentClicks ?? [],
        recentSignups: json.recentSignups ?? [],
        recentSubscribers: json.recentSubscribers ?? [],
      };
      setData(next);
      setCached(cacheKey, next);
      setError(false);
    } catch {
      if (!cached) setError(true);
    } finally {
      setLoading(false);
    }
  }, [focus]);

  useEffect(() => {
    load();
    // A specific past day doesn't change — don't poll while focused on one.
    if (focus) return;
    const t = setInterval(load, 15000); // keep "live now" fresh
    return () => clearInterval(t);
  }, [load, focus]);

  // Scroll to the focused section once, when arriving with a day drill-down.
  useEffect(() => {
    if (focus && data && !scrolledRef.current) {
      scrolledRef.current = true;
      const target = focus.metric === "clicks" ? "recent-clicks" : "recent-plays";
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focus, data]);

  const clearFocus = () => {
    setFocus(null);
    scrolledRef.current = false;
    window.history.replaceState(null, "", "/admin/data");
  };

  const prettyDay = (d?: string) =>
    d
      ? new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })
      : "";
  const metricLabel = (m: string) =>
    m === "views" ? "release views" : m === "clicks" ? "link clicks" : "plays";
  const prettyPlatform = (s: string) =>
    s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div>
      <PageHeader
        title="Live & raw data"
        description="Everything we store, unfiltered — live presence, recent events, and table counts."
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error || !data ? (
        <p className="py-12 text-center text-muted-foreground">Failed to load.</p>
      ) : (
        <div className="space-y-6">
          {focus ? (() => {
            const isClicks = focus.metric === "clicks";
            const count = isClicks ? data.recentClicks.length : data.recentPlays.length;
            const what = focus.linkType
              ? `${prettyPlatform(focus.linkType)} link clicks`
              : focus.contextId
                ? `link clicks on ${data.recentClicks[0]?.contextName || "this release"}`
                : metricLabel(focus.metric);
            const when = focus.date ? ` from ${prettyDay(focus.date)}` : "";
            return (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
                <span>
                  Showing the <strong className="text-foreground">{count.toLocaleString()}</strong> {what}
                  {when} — highlighted below.
                </span>
                <Button variant="outline" size="sm" className="shrink-0" onClick={clearFocus}>
                  Clear
                </Button>
              </div>
            );
          })() : null}
          {/* Privacy note */}
          <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              IP addresses are <strong className="text-foreground">not stored</strong> (privacy by design). Location is a
              coarse country/city from the CDN only, and visitor/session ids are random and anonymous (shown truncated).
              Tracking happens only for visitors who accepted analytics cookies.
            </span>
          </div>

          {/* Live now */}
          <Section
            title={`Live now — ${data.live.activeSessions} active`}
            hint={`Sessions with activity in the last 5 minutes. Auto-refreshes every 15s.${
              data.live.activeSessions > data.live.items.length
                ? ` Showing the ${data.live.items.length} most recent.`
                : ""
            }`}
          >
            {data.live.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody active right now.</p>
            ) : (
              <Table head={["Who", "Last page", "Location", "Seen", "Session"]}>
                {data.live.items.map((l) => (
                  <tr key={l.key} className="border-b border-border">
                    <td className={td}>{l.who}</td>
                    <td className={tdm}>{l.lastPath || "—"}</td>
                    <td className={tdm}>{loc(l.country, l.city)}</td>
                    <td className={tdm}>{ago(l.secondsAgo)}</td>
                    <td className={`${tdm} font-mono text-xs`}>{l.key}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Counts */}
          <Section title="Everything we store" hint="Total rows per collection.">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-3 lg:grid-cols-9">
              {Object.entries(data.counts).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="text-xs text-muted-foreground">{COUNT_LABELS[k] || k}</p>
                  <p className="text-xl font-light tabular-nums">{v.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Recent visits — one row per session (latest page + pages seen) */}
          <Section
            title="Recent visits"
            hint="One row per visit, newest first — each visitor's latest page and how many pages they viewed (not every individual page view). Only visitors who accepted analytics cookies are tracked."
          >
            {data.recentVisits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No visits recorded yet. Page views are only tracked for visitors who
                <strong className="text-foreground"> accept analytics cookies</strong> — open the
                public site, accept the banner, and browse a couple of pages to see them here.
              </p>
            ) : (
              <Table head={["Last active", "Who", "Latest page", "Pages", "Location", "Session"]}>
                {data.recentVisits.map((v) => (
                  <tr key={v.key} className="border-b border-border">
                    <td className={tdm}>{when(v.lastAt)}</td>
                    <td className={td}>{v.who}</td>
                    <td className={tdm}>{v.lastPath}</td>
                    <td className={`${td} tabular-nums`}>{v.pages}</td>
                    <td className={tdm}>{loc(v.country, v.city)}</td>
                    <td className={`${tdm} font-mono text-xs`}>{v.key}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Recent plays */}
          <Section
            id="recent-plays"
            highlight={focus?.metric === "plays" || focus?.metric === "views"}
            title={
              focus?.metric === "views"
                ? `Release views on ${prettyDay(focus.date)}`
                : focus?.metric === "plays"
                  ? `Plays on ${prettyDay(focus.date)}`
                  : "Recent plays & views"
            }
            hint={
              focus?.metric === "views"
                ? "Every release-page view recorded on this day."
                : focus?.metric === "plays"
                  ? "Every play recorded on this day."
                  : undefined
            }
          >
            {data.recentPlays.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {focus?.metric === "plays" || focus?.metric === "views"
                  ? "Nothing recorded on this day."
                  : "No plays yet."}
              </p>
            ) : (
              <Table head={["When", "Who", "Type", "Content", "Artist", "Location", "Completed"]}>
                {data.recentPlays.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className={tdm}>{when(r.createdAt)}</td>
                    <td className={td}>{r.who}</td>
                    <td className={tdm}>{r.contentType}</td>
                    <td className={td}>{r.contentName}</td>
                    <td className={tdm}>{r.artistName || "—"}</td>
                    <td className={tdm}>{loc(r.country, r.city)}</td>
                    <td className={tdm}>
                      <Badge variant={r.completed ? "success" : "warning"}>{r.completed ? "yes" : "partial"}</Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Recent clicks */}
          <Section
            id="recent-clicks"
            highlight={focus?.metric === "clicks"}
            title={
              focus?.linkType
                ? `${prettyPlatform(focus.linkType)} link clicks`
                : focus?.contextId
                  ? `Link clicks on ${data.recentClicks[0]?.contextName || "this release"}`
                  : focus?.metric === "clicks" && focus.date
                    ? `Link clicks on ${prettyDay(focus.date)}`
                    : "Recent link clicks"
            }
            hint={focus?.metric === "clicks" ? "Each row is one outbound click — Clear above to see all." : undefined}
          >
            {data.recentClicks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {focus?.metric === "clicks" ? "No matching link clicks." : "No link clicks yet."}
              </p>
            ) : (
              <Table head={["When", "Platform", "Context", "Name", "Session"]}>
                {data.recentClicks.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className={tdm}>{when(r.createdAt)}</td>
                    <td className={td}>{r.linkType}</td>
                    <td className={tdm}>{r.context}</td>
                    <td className={tdm}>{r.contextName || "—"}</td>
                    <td className={`${tdm} font-mono text-xs`}>{r.session || "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Signups + subscribers */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section title="Recent signups">
              {data.recentSignups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users yet.</p>
              ) : (
                <Table head={["When", "Name", "Email"]}>
                  {data.recentSignups.map((u) => (
                    <tr key={u.id} className="border-b border-border">
                      <td className={tdm}>{when(u.createdAt)}</td>
                      <td className={td}>{u.name || "—"}</td>
                      <td className={tdm}>{u.email}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
            <Section title="Recent newsletter subscribers">
              {data.recentSubscribers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No subscribers yet.</p>
              ) : (
                <Table head={["When", "Email"]}>
                  {data.recentSubscribers.map((s) => (
                    <tr key={s.email} className="border-b border-border">
                      <td className={tdm}>{when(s.createdAt)}</td>
                      <td className={td}>{s.email}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
