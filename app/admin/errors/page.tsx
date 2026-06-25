"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import { getCached, setCached, clearCached } from "@/lib/admin-cache";
import {
  Loader2,
  Trash2,
  RefreshCw,
  Check,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  ServerCog,
  Monitor,
  Radio,
  Archive,
  CheckCircle2,
} from "lucide-react";

const PAGE_SIZE = 25;
// How often the Live feed auto-refreshes (current bugs only).
const LIVE_POLL_MS = 20_000;

type ErrorRow = {
  id: string;
  level: string;
  source: string;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  digest: string | null;
  userEmail: string | null;
  userAgent: string | null;
  count: number;
  resolved: boolean;
  firstSeen: string;
  lastSeen: string;
};

type SourceFilter = "all" | "server" | "client";
// "live" = current, unresolved bugs (a feed). "log" = resolved history.
type Tab = "live" | "log";

export default function ErrorsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unresolved, setUnresolved] = useState(0);
  const [resolvedCount, setResolvedCount] = useState(0);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<SourceFilter>("all");
  const [tab, setTab] = useState<Tab>("live");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [working, setWorking] = useState(false); // clear-all (affects the whole table)
  const [busyId, setBusyId] = useState<string | null>(null); // per-row resolve/delete
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const isLive = tab === "live";

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (source !== "all") params.set("source", source);
      params.set("resolved", isLive ? "false" : "true");
      const qs = params.toString();
      const cacheKey = `errors?${qs}`;
      // Stale-while-revalidate: paint the last view instantly on revisit, then
      // refresh. Polls and the manual refresh pass { silent } to skip the spinner.
      const cached = getCached<{ items: ErrorRow[]; total: number; unresolved: number; resolvedCount: number }>(cacheKey);
      if (cached) {
        setItems(cached.items);
        setTotal(cached.total);
        setUnresolved(cached.unresolved);
        setResolvedCount(cached.resolvedCount);
        setLoading(false);
      } else if (!opts?.silent) {
        setLoading(true);
      }
      try {
        const res = await fetch(`/api/admin/error-log?${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems(data.items);
        setTotal(data.total);
        setUnresolved(data.unresolved);
        setResolvedCount(data.resolvedCount);
        setCached(cacheKey, {
          items: data.items,
          total: data.total,
          unresolved: data.unresolved,
          resolvedCount: data.resolvedCount,
        });
        // Clamp back if a delete/clear emptied the current page.
        const lastPage = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
        if (page > lastPage) setPage(lastPage);
      } catch {
        if (!cached && !opts?.silent) toast.error("Failed to load errors");
      } finally {
        setLoading(false);
      }
    },
    [page, source, isLive, toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Live feed: auto-refresh the current-bugs view in the background.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => loadRef.current({ silent: true }), LIVE_POLL_MS);
    return () => clearInterval(t);
  }, [isLive]);

  const setResolved = async (row: ErrorRow, resolved: boolean) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/error-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, resolved }),
      });
      if (!res.ok) throw new Error();
      toast.success(resolved ? "Moved to log (resolved)" : "Reopened — back in Live");
      clearCached();
      load();
    } catch {
      toast.error("Failed to update error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: ErrorRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/error-log?id=${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Error deleted");
      clearCached();
      load();
    } catch {
      toast.error("Failed to delete error");
    } finally {
      setBusyId(null);
    }
  };

  const clearAll = async () => {
    setWorking(true);
    try {
      const res = await fetch(`/api/admin/error-log?all=true`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Cleared ${data.deleted ?? 0} error${data.deleted === 1 ? "" : "s"}`);
      setClearAllOpen(false);
      setPage(1);
      clearCached();
      load();
    } catch {
      toast.error("Failed to clear errors");
    } finally {
      setWorking(false);
    }
  };

  const switchTab = (t: Tab) => {
    if (t === tab) return;
    setTab(t);
    setPage(1);
    setExpanded(null);
  };

  return (
    <div>
      <PageHeader
        title="Errors"
        description="Live feed of current bugs, plus a log of resolved ones. Investigate a live bug, then mark it resolved to move it to the log — or delete it."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              disabled={unresolved + resolvedCount === 0}
            >
              <Trash2 className="h-4 w-4" /> Clear all
            </Button>
          </div>
        }
      />

      {/* Primary split: Live (current) vs Log (resolved) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-card p-1 text-sm">
          <button
            type="button"
            onClick={() => switchTab("live")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors ${
              isLive ? "bg-red-500/15 text-red-300" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className="h-4 w-4" />
            Live
            <span
              className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                unresolved > 0 ? "bg-red-500/20 text-red-300" : "bg-white/10 text-muted-foreground"
              }`}
            >
              {unresolved.toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchTab("log")}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors ${
              !isLive ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Archive className="h-4 w-4" />
            Log
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
              {resolvedCount.toLocaleString()}
            </span>
          </button>
        </div>

        {/* Secondary: source filter, applies within the active tab */}
        <div className="flex rounded-md border border-border bg-card p-0.5 text-sm">
          {(["all", "server", "client"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSource(s);
                setPage(1);
              }}
              className={`rounded px-3 py-1.5 capitalize transition-colors ${
                source === s ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {isLive ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Auto-refreshing
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">Resolved history</span>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
          {isLive ? (
            <>
              {total.toLocaleString()} current bug{total === 1 ? "" : "s"}
            </>
          ) : (
            <>
              {total.toLocaleString()} resolved error{total === 1 ? "" : "s"}
            </>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              <th className="px-3 py-2 text-left font-medium">Error</th>
              <th className="w-20 px-3 py-2 text-left font-medium">Source</th>
              <th className="w-16 px-3 py-2 text-right font-medium">Count</th>
              <th className="w-40 px-3 py-2 text-left font-medium">Last seen</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-10 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground">
                  {isLive ? "No current bugs. 🎉" : "No resolved errors in the log yet."}
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const open = expanded === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className="cursor-pointer border-b border-border hover:bg-white/[0.02]"
                      onClick={() => setExpanded(open ? null : row.id)}
                    >
                      <td className="px-2 py-2.5 text-muted-foreground">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {isLive ? (
                            <span
                              className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                                row.level === "warn" ? "bg-amber-400" : "bg-red-500"
                              }`}
                              aria-hidden
                            />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
                          )}
                          <span
                            className={`truncate ${isLive ? "text-foreground" : "text-muted-foreground"}`}
                            title={row.message}
                          >
                            {row.message}
                          </span>
                          {!isLive ? (
                            <span className="shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-emerald-300">
                              Resolved
                            </span>
                          ) : null}
                        </div>
                        {row.path ? (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {row.method ? `${row.method} ` : ""}
                            {row.path}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          {row.source === "server" ? (
                            <ServerCog className="h-3.5 w-3.5" />
                          ) : (
                            <Monitor className="h-3.5 w-3.5" />
                          )}
                          {row.source}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                        {row.count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {new Date(row.lastSeen).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 text-muted-foreground ${
                              isLive ? "hover:text-emerald-400" : "hover:text-amber-400"
                            }`}
                            onClick={() => setResolved(row, isLive)}
                            disabled={busyId === row.id}
                            aria-label={isLive ? "Mark resolved (move to log)" : "Reopen (move to live)"}
                            title={isLive ? "Mark resolved → Log" : "Reopen → Live"}
                          >
                            {isLive ? <Check className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                            onClick={() => remove(row)}
                            disabled={busyId === row.id}
                            aria-label="Delete"
                            title="Delete permanently"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-border bg-black/20">
                        <td />
                        <td colSpan={5} className="px-3 py-3">
                          <dl className="mb-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                            <div><dt className="inline font-medium">First seen: </dt><dd className="inline">{new Date(row.firstSeen).toLocaleString()}</dd></div>
                            {row.statusCode ? <div><dt className="inline font-medium">Status: </dt><dd className="inline">{row.statusCode}</dd></div> : null}
                            {row.userEmail ? <div><dt className="inline font-medium">User: </dt><dd className="inline">{row.userEmail}</dd></div> : null}
                            {row.digest ? <div><dt className="inline font-medium">Digest: </dt><dd className="inline">{row.digest}</dd></div> : null}
                            {row.userAgent ? <div className="col-span-2 truncate sm:col-span-3"><dt className="inline font-medium">UA: </dt><dd className="inline">{row.userAgent}</dd></div> : null}
                          </dl>
                          {row.stack ? (
                            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-black/40 p-3 text-xs leading-relaxed text-foreground/80">
                              {row.stack}
                            </pre>
                          ) : (
                            <p className="text-xs text-muted-foreground">No stack trace captured.</p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </div>

      <Dialog open={clearAllOpen} onOpenChange={(o) => !o && setClearAllOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear all errors</DialogTitle>
            <DialogDescription>
              Permanently delete <span className="text-foreground">every</span> logged error —
              both the live feed and the resolved log. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={clearAll} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
