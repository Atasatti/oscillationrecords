"use client";
import React, { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";

interface RawData {
  now: string;
  counts: Record<string, number>;
  live: {
    activeSessions: number;
    items: Array<{ key: string; who: string; lastPath: string | null; country: string | null; city: string | null; secondsAgo: number }>;
  };
  recentPageViews: Array<{ id: string; path: string; referrer: string | null; utm: string | null; country: string | null; city: string | null; session: string | null; visitor: string | null; who: string; createdAt: string }>;
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

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      {hint ? <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p> : <div className="mb-3" />}
      {children}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
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

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/raw", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // keep "live now" fresh
    return () => clearInterval(t);
  }, [load]);

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
          <Section title={`Live now — ${data.live.activeSessions} active`} hint="Sessions with activity in the last 5 minutes. Auto-refreshes every 15s.">
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

          {/* Recent page views */}
          <Section title="Recent page views">
            {data.recentPageViews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No page views yet.</p>
            ) : (
              <Table head={["When", "Who", "Path", "Location", "Referrer", "Campaign", "Session"]}>
                {data.recentPageViews.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className={tdm}>{when(r.createdAt)}</td>
                    <td className={td}>{r.who}</td>
                    <td className={tdm}>{r.path}</td>
                    <td className={tdm}>{loc(r.country, r.city)}</td>
                    <td className={`${tdm} max-w-[14rem] truncate`} title={r.referrer || undefined}>{r.referrer || "—"}</td>
                    <td className={tdm}>{r.utm || "—"}</td>
                    <td className={`${tdm} font-mono text-xs`}>{r.session || "—"}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>

          {/* Recent plays */}
          <Section title="Recent plays & views">
            {data.recentPlays.length === 0 ? (
              <p className="text-sm text-muted-foreground">No plays yet.</p>
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
          <Section title="Recent link clicks">
            {data.recentClicks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No link clicks yet.</p>
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
