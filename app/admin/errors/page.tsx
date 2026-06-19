"use client";
import React, { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";

const PAGE_SIZE = 25;

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

export default function ErrorsPage() {
  const toast = useToast();
  const [items, setItems] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unresolved, setUnresolved] = useState(0);
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<SourceFilter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [working, setWorking] = useState(false); // clear-all (affects the whole table)
  const [busyId, setBusyId] = useState<string | null>(null); // per-row resolve/delete
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (source !== "all") params.set("source", source);
      if (!showResolved) params.set("resolved", "false");
      const res = await fetch(`/api/admin/error-log?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setUnresolved(data.unresolved);
      // Clamp back if a delete/clear emptied the current page.
      const lastPage = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
    } catch {
      toast.error("Failed to load errors");
    } finally {
      setLoading(false);
    }
  }, [page, source, showResolved, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setResolved = async (row: ErrorRow, resolved: boolean) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/error-log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, resolved }),
      });
      if (!res.ok) throw new Error();
      toast.success(resolved ? "Marked resolved" : "Reopened");
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
      load();
    } catch {
      toast.error("Failed to clear errors");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Errors"
        description="Server and client errors from across the site, de-duplicated and counted. Investigate, then mark resolved or delete."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClearAllOpen(true)}
              disabled={total === 0}
            >
              <Trash2 className="h-4 w-4" /> Clear all
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => {
              setShowResolved(e.target.checked);
              setPage(1);
            }}
            className="h-4 w-4 rounded border-border"
          />
          Show resolved
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {unresolved.toLocaleString()} open
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
          {total.toLocaleString()} distinct error{total === 1 ? "" : "s"}
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
                  {showResolved ? "No errors logged." : "No open errors. 🎉"}
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const open = expanded === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`border-b border-border hover:bg-white/[0.02] cursor-pointer ${
                        row.resolved ? "opacity-50" : ""
                      }`}
                      onClick={() => setExpanded(open ? null : row.id)}
                    >
                      <td className="px-2 py-2.5 text-muted-foreground">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                              row.level === "warn" ? "bg-amber-400" : "bg-red-500"
                            }`}
                            aria-hidden
                          />
                          <span className="truncate text-foreground" title={row.message}>
                            {row.message}
                          </span>
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
                            className="h-8 w-8 text-muted-foreground hover:text-emerald-400"
                            onClick={() => setResolved(row, !row.resolved)}
                            disabled={busyId === row.id}
                            aria-label={row.resolved ? "Reopen" : "Mark resolved"}
                            title={row.resolved ? "Reopen" : "Mark resolved"}
                          >
                            {row.resolved ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-400"
                            onClick={() => remove(row)}
                            disabled={busyId === row.id}
                            aria-label="Delete"
                            title="Delete"
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
                            {row.userAgent ? <div className="col-span-2 sm:col-span-3 truncate"><dt className="inline font-medium">UA: </dt><dd className="inline">{row.userAgent}</dd></div> : null}
                          </dl>
                          {row.stack ? (
                            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-black/40 p-3 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
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
              Permanently delete <span className="text-foreground">every</span> logged error
              (the whole log, not just this filter/page)? This cannot be undone.
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
