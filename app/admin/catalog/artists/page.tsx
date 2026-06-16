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
  Disc3,
  Play,
  Calendar,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import HomeOrderPanel from "@/components/admin/HomeOrderPanel";
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
import type { AdminArtistRow, ArtistSort, SortDir } from "@/lib/admin-data";

const PAGE_SIZE = 25;

export default function AdminArtistsPage() {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<AdminArtistRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArtistSort>("sortOrder");
  const [dir, setDir] = useState<SortDir>("asc");
  const [visFilter, setVisFilter] = useState<"all" | "live" | "hidden">("all");
  const [featFilter, setFeatFilter] = useState<"all" | "featured" | "not">("all");
  const [genre, setGenre] = useState("");
  const [genreOptions, setGenreOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<"manage" | "home">("manage");

  // Debounce the search box → query (and reset to page 1).
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
      if (visFilter !== "all") params.set("visibility", visFilter);
      if (featFilter !== "all") params.set("featured", featFilter);
      if (genre) params.set("genre", genre);
      const res = await fetch(`/api/artists?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load artists");
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      toast.error("Failed to load artists");
    } finally {
      setLoading(false);
    }
  }, [page, query, sort, dir, visFilter, featFilter, genre, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Load distinct genres once for the filter dropdown.
  useEffect(() => {
    fetch("/api/admin/artists/genres")
      .then((r) => (r.ok ? r.json() : { genres: [] }))
      .then((d) => setGenreOptions(d.genres || []))
      .catch(() => {});
  }, []);

  const toggleSort = (field: ArtistSort) => {
    if (sort === field) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setDir("asc");
    }
    setPage(1);
  };

  const sortIcon = (field: ArtistSort) =>
    sort !== field ? null : dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );

  const allSelected = items.length > 0 && items.every((a) => selected.has(a.id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((a) => a.id)));
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setVisibility = async (id: string, showOnWebsite: boolean) => {
    const prev = items;
    setItems((list) => list.map((a) => (a.id === id ? { ...a, showOnWebsite } : a)));
    try {
      const res = await fetch(`/api/artists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnWebsite }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Failed to update visibility");
    }
  };

  const setFeatured = async (id: string, featuredOnHome: boolean) => {
    const prev = items;
    setItems((list) => list.map((a) => (a.id === id ? { ...a, featuredOnHome } : a)));
    try {
      const res = await fetch(`/api/artists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featuredOnHome }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setItems(prev);
      toast.error("Failed to update featured");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/artists/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Artist deleted");
      setDeleteTarget(null);
      load();
    } catch {
      toast.error("Failed to delete artist");
    } finally {
      setWorking(false);
    }
  };

  const bulkAction = async (action: "show" | "hide" | "delete") => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setWorking(true);
    try {
      const res = await fetch("/api/admin/artists/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        action === "delete"
          ? `Deleted ${ids.length} artist${ids.length === 1 ? "" : "s"}`
          : `Updated ${ids.length} artist${ids.length === 1 ? "" : "s"}`
      );
      setBulkDeleteOpen(false);
      load();
    } catch {
      toast.error("Bulk action failed");
    } finally {
      setWorking(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <div>
      <PageHeader
        title="Artists"
        description="Search, manage visibility, and edit your roster."
        actions={
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href="/admin/catalog/artists/new">
              <Plus className="h-4 w-4" />
              New artist
            </Link>
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
          <Star className="h-3.5 w-3.5" /> Home order
        </button>
      </div>

      {view === "home" ? (
        <HomeOrderPanel
          endpoint="/api/admin/artists/home-order"
          emptyTitle="No featured artists yet."
          emptyHint={
            <>
              Switch to “Manage” and toggle{" "}
              <span className="text-foreground">Featured</span> on the artists you want
              in the home carousel.
            </>
          }
        />
      ) : (
        <>
      {/* Search + filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search artists by name…"
            aria-label="Search artists"
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
          value={visFilter}
          onChange={(e) => {
            setVisFilter(e.target.value as typeof visFilter);
            setPage(1);
          }}
          aria-label="Filter by visibility"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All visibility</option>
          <option value="live">Live</option>
          <option value="hidden">Hidden</option>
        </select>

        <select
          value={featFilter}
          onChange={(e) => {
            setFeatFilter(e.target.value as typeof featFilter);
            setPage(1);
          }}
          aria-label="Filter by featured"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All artists</option>
          <option value="featured">Featured only</option>
          <option value="not">Not featured</option>
        </select>

        <select
          value={genre}
          onChange={(e) => {
            setGenre(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by genre"
          className="rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All genres</option>
          {genreOptions.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        {(visFilter !== "all" || featFilter !== "all" || genre) ? (
          <button
            type="button"
            onClick={() => {
              setVisFilter("all");
              setFeatFilter("all");
              setGenre("");
              setPage(1);
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <span className="text-sm text-muted-foreground">
            {selectedCount} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={working} onClick={() => bulkAction("show")}>
              Show on site
            </Button>
            <Button variant="outline" size="sm" disabled={working} onClick={() => bulkAction("hide")}>
              Hide
            </Button>
            <Button variant="outline" size="sm" disabled={working} onClick={() => setBulkDeleteOpen(true)} className="text-red-400 hover:text-red-300">
              Delete
            </Button>
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
                />
              </TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Artist {sortIcon("name")}
                </button>
              </TableHead>
              <TableHead className="hidden lg:table-cell">Genre</TableHead>
              <TableHead className="hidden md:table-cell text-right">
                <span className="inline-flex items-center gap-1"><Disc3 className="h-3.5 w-3.5" /> Releases</span>
              </TableHead>
              <TableHead className="hidden lg:table-cell text-right">
                <span className="inline-flex items-center gap-1"><Play className="h-3.5 w-3.5" /> Plays 90d</span>
              </TableHead>
              <TableHead className="hidden xl:table-cell">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Last release</span>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Profile</TableHead>
              <TableHead>Visibility</TableHead>
              <TableHead>Featured</TableHead>
              <TableHead className="hidden xl:table-cell">
                <button type="button" onClick={() => toggleSort("createdAt")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Added {sortIcon("createdAt")}
                </button>
              </TableHead>
              <TableHead className="w-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="ml-auto h-4 w-10" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="hidden xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center text-muted-foreground">
                  {query ? `No artists match “${query}”.` : "No artists yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <TableRow key={a.id} data-state={selected.has(a.id) ? "selected" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      aria-label={`Select ${a.name}`}
                      className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/catalog/artists/${a.id}/edit`} className="flex items-center gap-3 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.profilePicture || "/placeholder.svg"}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                      <span className="truncate font-medium group-hover:underline">{a.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {a.genres.length ? (
                      <div className="flex flex-wrap gap-1">
                        {a.genres.slice(0, 2).map((g) => (
                          <Badge key={g} variant="muted">{g}</Badge>
                        ))}
                        {a.genres.length > 2 ? (
                          <Badge variant="muted">+{a.genres.length - 2}</Badge>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right text-sm tabular-nums">
                    {a.releaseCount}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums text-muted-foreground">
                    {a.playsLast90d.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {a.lastReleaseDate
                      ? new Date(a.lastReleaseDate).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {a.complete ? (
                      <Badge variant="success">Complete</Badge>
                    ) : (
                      <Badge variant="warning" title={`Missing: ${a.missing.join(", ")}`}>
                        Needs {a.missing.length}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setVisibility(a.id, !a.showOnWebsite)}
                      title="Toggle visibility on the public site"
                    >
                      {a.showOnWebsite ? (
                        <Badge variant="success">Live</Badge>
                      ) : (
                        <Badge variant="muted">Hidden</Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setFeatured(a.id, !a.featuredOnHome)}
                      title="Feature in the home carousel"
                    >
                      {a.featuredOnHome ? (
                        <Badge variant="warning">
                          <Star className="h-3 w-3" /> Featured
                        </Badge>
                      ) : (
                        <Badge variant="muted">Off</Badge>
                      )}
                    </button>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {new Date(a.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${a.name}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/catalog/artists/${a.id}/edit`)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/admin/catalog/artist/${a.id}`)}>
                          <Eye className="mr-2 h-4 w-4" /> View releases
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                          onClick={() => setDeleteTarget({ id: a.id, name: a.name })}
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
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
          />
        </div>
      </div>
        </>
      )}

      {/* Single delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete artist</DialogTitle>
            <DialogDescription>
              Delete &quot;{deleteTarget?.name}&quot;? This also removes their releases
              where they are the sole primary artist. This cannot be undone.
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

      {/* Bulk delete dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} artists</DialogTitle>
            <DialogDescription>
              This deletes the selected artists and their sole-primary releases.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => bulkAction("delete")} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete {selectedCount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
