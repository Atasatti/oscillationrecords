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
  Eye,
  Trash2,
  ArrowUp,
  ArrowDown,
  Loader2,
  Star,
  Database,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import HomeOrderPanel from "@/components/admin/HomeOrderPanel";
import NewReleaseDialog from "@/components/admin/NewReleaseDialog";
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
import type { ReleaseCardDTO } from "@/lib/catalog-data";
import type { ReleaseSort, SortDir } from "@/lib/admin-data";
import { buildHarmonyReleaseUrl, canSeedRelease } from "@/lib/musicbrainz-seed";

const PAGE_SIZE = 25;

function kindLabel(type: ReleaseCardDTO["type"]) {
  return type === "album" ? "Album" : type === "ep" ? "EP" : "Single";
}

export default function AdminReleasesPage() {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<ReleaseCardDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReleaseSort>("createdAt");
  const [dir, setDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<"all" | "DRAFT" | "SCHEDULED" | "RELEASED">("all");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<"manage" | "home">("manage");

  // "New release" picker (choose artist + type) — shared with the Coming Soon page.
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        sort,
        dir,
      });
      if (query) params.set("q", query);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/releases?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } catch {
      toast.error("Failed to load releases");
    } finally {
      setLoading(false);
    }
  }, [page, query, sort, dir, statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSort = (field: ReleaseSort) => {
    if (sort === field) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(field);
      setDir(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const sortIcon = (field: ReleaseSort) =>
    sort !== field ? null : dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );

  const patchFlag = async (
    id: string,
    key: "showOnHome" | "showLatestOnHome",
    value: boolean
  ) => {
    const prev = items;
    setItems((list) => list.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    try {
      const res = await fetch(`/api/releases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Failed to update");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/releases/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Release deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete release");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Releases"
        description="Search, manage, and curate your catalog. Tracks are edited from a release."
        actions={
          <Button className="bg-white text-black hover:bg-gray-200" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New release
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setView("manage")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            view === "manage"
              ? "border-white text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Manage
        </button>
        <button
          type="button"
          onClick={() => setView("home")}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            view === "home"
              ? "border-white text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Star className="h-3.5 w-3.5" /> New Music order
        </button>
      </div>

      {view === "home" ? (
        <HomeOrderPanel
          endpoint="/api/admin/releases/home-order"
          emptyTitle="No releases in the New Music carousel yet."
          emptyHint={
            <>
              Switch to “Manage” and turn on{" "}
              <span className="text-foreground">New Music</span> for the releases you
              want featured on the home carousel.
            </>
          }
        />
      ) : (
        <>
          {/* Search + status filter */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="Search releases by name or artist…"
                aria-label="Search releases"
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
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as typeof statusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All statuses</option>
              <option value="RELEASED">Released</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>

          <div className="rounded-xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Release {sortIcon("name")}
                    </button>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Artist</TableHead>
                  <TableHead>
                    <button type="button" onClick={() => toggleSort("kind")} className="inline-flex items-center gap-1 hover:text-foreground">
                      Type {sortIcon("kind")}
                    </button>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead>New Music</TableHead>
                  <TableHead className="w-10 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-12 w-12 rounded" />
                          <Skeleton className="h-4 w-40" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                      <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      {query ? `No releases match “${query}”.` : "No releases yet."}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link href={`/admin/catalog/release/${r.id}`} className="flex items-center gap-3 group">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={r.thumbnail || "/new-music-img1.svg"}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded object-cover"
                          />
                          <span className="truncate font-medium group-hover:underline">{r.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate">
                        {r.primaryArtistName || r.artist || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{kindLabel(r.type)}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "RELEASED" ? (
                          <Badge variant="success">Released</Badge>
                        ) : r.status === "SCHEDULED" ? (
                          <Badge variant="warning">Scheduled</Badge>
                        ) : (
                          <Badge variant="muted">Draft</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={() => patchFlag(r.id, "showLatestOnHome", !r.showLatestOnHome)} title="Show the 'Latest' pill on home">
                          {r.showLatestOnHome ? <Badge variant="destructive">Latest</Badge> : <Badge variant="muted">Off</Badge>}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button type="button" onClick={() => patchFlag(r.id, "showOnHome", !r.showOnHome)} title="Feature in the New Music carousel">
                          {r.showOnHome ? <Badge variant="warning"><Star className="h-3 w-3" /> On</Badge> : <Badge variant="muted">Off</Badge>}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${r.name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/admin/catalog/release/${r.id}`)}>
                              <Eye className="mr-2 h-4 w-4" /> View / tracks
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => router.push(`/admin/catalog/releases/${r.id}/edit`)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit details
                            </DropdownMenuItem>
                            {canSeedRelease({ gtin: r.upcCode, urls: [r.spotifyLink, r.appleMusicLink] }) ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  window.open(
                                    buildHarmonyReleaseUrl({
                                      gtin: r.upcCode,
                                      urls: [r.spotifyLink, r.appleMusicLink],
                                    }),
                                    "_blank",
                                    "noopener,noreferrer"
                                  )
                                }
                              >
                                <Database className="mr-2 h-4 w-4" /> Add to MusicBrainz
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                              variant="destructive"
                              className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                              onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
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
            <DialogTitle>Delete release</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? This removes the release and all
              of its tracks. This cannot be undone.
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

      <NewReleaseDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}
