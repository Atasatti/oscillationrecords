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
import { Search, X, Download, Trash2, Loader2 } from "lucide-react";
import { getCached, setCached, clearCached, isFresh } from "@/lib/admin-cache";

const PAGE_SIZE = 25;
type Sub = { id: string; email: string; createdAt: string };

export default function SubscribersPage() {
  const toast = useToast();
  const [items, setItems] = useState<Sub[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Sub | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) params.set("q", query);
    const qs = params.toString();
    const cacheKey = `subscribers?${qs}`;
    const cached = getCached<{ items: Sub[]; total: number }>(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setLoading(false);
      if (isFresh(cacheKey)) return;
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/admin/subscribers?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setCached(cacheKey, { items: data.items, total: data.total });
      // Clamp back if a delete emptied the current page (avoid a stuck empty table).
      const lastPage = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
    } catch {
      if (!cached) toast.error("Failed to load subscribers");
    } finally {
      setLoading(false);
    }
  }, [page, query, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/admin/subscribers?id=${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Subscriber removed");
      setDeleteTarget(null);
      clearCached();
      load();
    } catch {
      toast.error("Failed to remove subscriber");
    } finally {
      setWorking(false);
    }
  };

  const exportCsv = () => {
    const params = new URLSearchParams({ format: "csv" });
    if (query) params.set("q", query);
    window.open(`/api/admin/subscribers?${params.toString()}`, "_blank");
  };

  return (
    <div>
      <PageHeader
        title="Subscribers"
        description="Newsletter signups from the public site. Export the list or remove an address on request."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={total === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search by email…"
            className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {queryInput ? (
            <button
              type="button"
              onClick={() => setQueryInput("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">
          {total.toLocaleString()} subscriber{total === 1 ? "" : "s"}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Subscribed</th>
              <th className="w-10 px-4 py-2 text-right font-medium">Remove</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="py-10 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-12 text-center text-muted-foreground">
                  {query ? `No subscribers match “${query}”.` : "No subscribers yet."}
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-b border-border hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-foreground">{s.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => setDeleteTarget(s)}
                      aria-label={`Remove ${s.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="border-t border-border px-4 py-3">
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove subscriber</DialogTitle>
            <DialogDescription>
              Remove <span className="text-foreground">{deleteTarget?.email}</span> from the newsletter list?
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
