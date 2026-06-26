"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Plus,
  MoreVertical,
  Pencil,
  ExternalLink,
  Trash2,
  Loader2,
  Star,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import ManualOrderPanel from "@/components/admin/ManualOrderPanel";
import type { AdminPressRow } from "@/lib/admin-data";
import { getCached, setCached, clearCached, isFresh } from "@/lib/admin-cache";

const PAGE_SIZE = 25;

export default function AdminPressClient({
  initialData,
}: {
  initialData: { items: AdminPressRow[]; total: number } | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<AdminPressRow[]>(initialData?.items ?? []);
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!initialData);
  // Seed the cache with the server-rendered first page so load() skips the
  // initial client fetch (rows already shipped in the HTML).
  useState(() => {
    if (initialData) {
      setCached(`press?page=1&pageSize=${PAGE_SIZE}`, {
        items: initialData.items,
        total: initialData.total,
      });
    }
    return null;
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<"manage" | "order">("manage");

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
    const cacheKey = `press?${qs}`;
    const cached = getCached<{ items: AdminPressRow[]; total: number }>(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setLoading(false);
      if (isFresh(cacheKey)) return;
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/press?${qs}`);
      if (!res.ok) throw new Error("Failed to load press");
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setCached(cacheKey, { items: data.items, total: data.total });
    } catch (e) {
      console.error(e);
      if (!cached) toast.error("Failed to load press");
    } finally {
      setLoading(false);
    }
  }, [page, query, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, boolean>, errMsg: string) => {
    const prev = items;
    setItems((list) => list.map((p) => (p.id === id ? { ...p, ...body } : p)));
    try {
      const res = await fetch(`/api/press/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      clearCached(); // persisted change — keep cached views honest on revisit
    } catch {
      setItems(prev);
      toast.error(errMsg);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/press/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Press item deleted");
      setDeleteTarget(null);
      clearCached();
      load();
    } catch {
      toast.error("Failed to delete press item");
    } finally {
      setWorking(false);
    }
  };

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
      : "—";

  return (
    <div>
      <PageHeader
        title="Press"
        description="Press & media coverage of your artists and releases. Add your own short summary of each article and link out to the original."
        actions={
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href="/admin/catalog/press/new">
              <Plus className="h-4 w-4" />
              New press item
            </Link>
          </Button>
        }
      />

      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {([["manage", "Manage"], ["order", "Custom order"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setView(k);
              if (k === "manage") load();
            }}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              view === k ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        {view === "order"
          ? "Drag press items into the order they should appear on the site (and in this list)."
          : "Browse, search and edit press items. Switch to “Custom order” to set the order they appear on the site."}
      </p>

      {view === "order" ? (
        <ManualOrderPanel
          loadEndpoint="/api/admin/press/reorder"
          saveEndpoint="/api/admin/press/reorder"
          kind="press"
        />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search by title or publisher…"
                aria-label="Search press"
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Publisher</TableHead>
                  <TableHead className="hidden lg:table-cell">Linked</TableHead>
                  <TableHead className="hidden xl:table-cell">Published</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead className="w-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-10 w-16 rounded" />
                          <Skeleton className="h-4 w-48" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      {query ? `No press matches “${query}”.` : "No press items yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((p) => {
                    const linked = [
                      ...p.artists.map((a) => a.name),
                      ...p.releases.map((r) => r.name),
                    ];
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Link href={`/admin/catalog/press/${p.id}/edit`} className="flex items-center gap-3 group">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={p.image || "/placeholder.svg"}
                              alt=""
                              className="h-10 w-16 shrink-0 rounded object-cover"
                            />
                            <span className="truncate font-medium group-hover:underline">{p.title}</span>
                            {p.draft ? (
                              <Badge variant="warning" className="shrink-0">Draft</Badge>
                            ) : null}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {p.publisher}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {linked.length ? (
                            <span className="truncate">
                              {linked.slice(0, 2).join(", ")}
                              {linked.length > 2 ? ` +${linked.length - 2}` : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                          {fmtDate(p.publishedAt)}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => patch(p.id, { showOnWebsite: !p.showOnWebsite }, "Failed to update visibility")}
                            title="Toggle visibility on the public site"
                          >
                            {p.showOnWebsite ? (
                              <Badge variant="success">Live</Badge>
                            ) : (
                              <Badge variant="muted">Hidden</Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => patch(p.id, { featured: !p.featured }, "Failed to update featured")}
                            title="Mark as featured"
                          >
                            {p.featured ? (
                              <Badge variant="warning">
                                <Star className="h-3 w-3" /> Featured
                              </Badge>
                            ) : (
                              <Badge variant="muted">Off</Badge>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${p.title}`}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/admin/catalog/press/${p.id}/edit`)}>
                                <Pencil className="mr-2 h-4 w-4" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <a href={p.articleUrl} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="mr-2 h-4 w-4" /> Open article
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                                onClick={() => setDeleteTarget({ id: p.id, title: p.title })}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <div className="border-t border-border px-4 py-3">
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </div>
          </div>
        </>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete press item</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.title}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
