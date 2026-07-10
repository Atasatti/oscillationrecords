"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/local-ui/Toast";
import { getCached, setCached } from "@/lib/admin-cache";
import { ROLE_LABELS, isStaffRole } from "@/lib/permissions";
import { Loader2, RefreshCw, ScrollText, ShieldAlert } from "lucide-react";

type AuditRow = {
  id: string;
  at: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  summary: string;
  ip: string | null;
};

// Colour each action so the log scans at a glance.
type BadgeVariant = "default" | "muted" | "warning" | "destructive" | "success";
function actionVariant(action: string): BadgeVariant {
  if (action === "delete") return "destructive";
  if (action === "create") return "success";
  if (action === "role.change") return "warning";
  if (action === "update") return "default";
  return "muted";
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const PAGE = 100;

export default function AuditPage() {
  const toast = useToast();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [resources, setResources] = useState<string[]>([]);
  const [resource, setResource] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const cacheKey = useMemo(() => `audit-${resource || "all"}`, [resource]);

  const load = useCallback(async () => {
    const cached = getCached<AuditRow[]>(cacheKey);
    if (cached) { setItems(cached); setLoading(false); } else { setLoading(true); }
    setDone(false);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE) });
      if (resource) qs.set("resource", resource);
      const res = await fetch(`/api/admin/audit?${qs.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setResources(data.resources ?? []);
      setCached(cacheKey, data.items);
      if ((data.items?.length ?? 0) < PAGE) setDone(true);
    } catch {
      if (!cached) toast.error("Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [cacheKey, resource, toast]);

  useEffect(() => { load(); }, [load]);

  const loadOlder = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ limit: String(PAGE), before: last.at });
      if (resource) qs.set("resource", resource);
      const res = await fetch(`/api/admin/audit?${qs.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const older: AuditRow[] = data.items ?? [];
      setItems((prev) => [...prev, ...older]);
      if (older.length < PAGE) setDone(true);
    } catch {
      toast.error("Failed to load older entries");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="A record of who changed what across the admin — role changes and catalog / outreach edits."
        actions={
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          aria-label="Filter by resource"
          className="rounded-md border border-border bg-card py-1.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All resources</option>
          {resources.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <Skeleton className="mb-1.5 h-4 w-72" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-8 text-sm text-muted-foreground">
          <ScrollText className="h-5 w-5 shrink-0 text-muted-foreground" />
          No activity recorded yet. Admin changes will appear here as they happen.
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((a) => {
              const roleLabel = isStaffRole(a.actorRole) ? ROLE_LABELS[a.actorRole] : a.actorRole;
              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                    {a.action === "role.change"
                      ? <ShieldAlert className="h-4 w-4 text-amber-400" />
                      : <ScrollText className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{a.summary}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="truncate">{a.actorEmail || "system"}</span>
                      {roleLabel ? (<><span className="text-border" aria-hidden>·</span><span>{roleLabel}</span></>) : null}
                      <span className="text-border" aria-hidden>·</span>
                      <span>{fmtWhen(a.at)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="muted" className="text-[10px] capitalize">{a.resource}</Badge>
                    <Badge variant={actionVariant(a.action)} className="text-[10px]">{a.action}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>

          {!done ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={loadOlder} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Load older
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-center text-xs text-muted-foreground">— end of log —</p>
          )}
        </>
      )}
    </div>
  );
}
