"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import NewReleaseDialog from "@/components/admin/NewReleaseDialog";
import ManualOrderPanel from "@/components/admin/ManualOrderPanel";
import InfoHint from "@/components/admin/InfoHint";
import type { AdminArtistRow, ArtistSort, SortDir } from "@/lib/admin-data";
import { getCached, setCached, clearCached, isFresh } from "@/lib/admin-cache";
import { unlockBody } from "@/lib/unlock-body";

const PAGE_SIZE = 25;

type ArtistRowActions = {
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSetVisibility: (id: string, showOnWebsite: boolean) => void;
  onSetFeatured: (id: string, featuredOnHome: boolean) => void;
  onEdit: (id: string) => void;
  onViewReleases: (id: string) => void;
  onNewRelease: (row: { id: string; name: string }) => void;
  onDelete: (row: { id: string; name: string }) => void;
};

/**
 * One artist row, memoized so a single-row mutation (visibility / featured toggle)
 * re-renders ONLY that row instead of every row on the page. Each row is heavy — a
 * Radix actions dropdown plus two SEO badges — so re-rendering all ~25 for a
 * one-boolean change was a ~200ms main-thread long task that made the toggle feel
 * laggy. Optimistically updating one row now hands the other rows the SAME `a`
 * object reference, so they skip re-rendering entirely.
 *
 * The comparator deliberately compares only `a` and `selected` and ignores the
 * callback props: the parent recreates those each render, but they read live state
 * through a ref / stable setters, so a row safely keeps an older closure without
 * going stale. That lets the rows stay memoized without wrapping every handler in
 * useCallback.
 */
const ArtistRow = React.memo(
  function ArtistRow({
    a,
    selected,
    onToggleSelect,
    onSetVisibility,
    onSetFeatured,
    onEdit,
    onViewReleases,
    onNewRelease,
    onDelete,
  }: { a: AdminArtistRow } & ArtistRowActions) {
    return (
      <TableRow data-state={selected ? "selected" : undefined}>
        <TableCell>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(a.id)}
            aria-label={`Select ${a.name}`}
            className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
          />
        </TableCell>
        <TableCell className="w-full max-w-0">
          <Link href={`/admin/artists/${a.id}/edit`} className="flex min-w-0 items-center gap-3 group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.profilePicture || "/placeholder.svg"}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg object-cover @sm:h-12 @sm:w-12"
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate font-medium group-hover:underline">{a.name}</span>
                {a.draft ? (
                  <Badge variant="warning" className="shrink-0">Draft</Badge>
                ) : null}
              </span>
              {/* Genre column is hidden until the table is wide enough — surface
                  the genres here so they stay visible on small screens. */}
              {a.genres.length ? (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground @lg:hidden">
                  {a.genres.join(", ")}
                </span>
              ) : null}
            </span>
          </Link>
        </TableCell>
        <TableCell className="hidden @lg:table-cell">
          {a.genres.length ? (
            <div className="flex items-center gap-1">
              {/* Only the first genre inline (keeps the column narrow on
                  laptop widths); the rest collapse into a +N badge whose
                  hover title lists them, so nothing is lost. */}
              <Badge variant="muted" className="max-w-[7rem] truncate">{a.genres[0]}</Badge>
              {a.genres.length > 1 ? (
                <span title={a.genres.slice(1).join(", ")}>
                  <Badge variant="muted" className="cursor-default">+{a.genres.length - 1}</Badge>
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="hidden @2xl:table-cell text-right text-sm tabular-nums">
          {a.releaseCount}
        </TableCell>
        <TableCell className="hidden @5xl:table-cell text-right text-sm tabular-nums text-muted-foreground">
          {a.playsLast90d.toLocaleString()}
        </TableCell>
        <TableCell className="hidden @7xl:table-cell whitespace-nowrap text-sm text-muted-foreground">
          {a.lastReleaseDate
            ? new Date(a.lastReleaseDate).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "—"}
        </TableCell>
        <TableCell className="hidden @xl:table-cell">
          <Link
            href={`/admin/artists/${a.id}/edit`}
            title={
              a.complete
                ? "All key SEO fields filled"
                : `To improve SEO, add: ${a.missing.join(", ")} — click to edit`
            }
            className="inline-flex"
          >
            <Badge
              variant={
                a.seoGrade === "strong"
                  ? "success"
                  : a.seoGrade === "good"
                    ? "warning"
                    : "destructive"
              }
              className="cursor-pointer tabular-nums hover:opacity-80"
            >
              {a.seoScore}
            </Badge>
          </Link>
        </TableCell>
        <TableCell className="hidden @3xl:table-cell">
          <Link
            href={`/admin/artists/${a.id}/edit`}
            title={
              a.gkpComplete
                ? "All Knowledge Panel signals filled"
                : `To improve Knowledge Panel readiness, add: ${a.gkpMissing.join(", ")} — click to edit`
            }
            className="inline-flex"
          >
            <Badge
              variant={
                a.gkpGrade === "strong"
                  ? "success"
                  : a.gkpGrade === "good"
                    ? "warning"
                    : "destructive"
              }
              className="cursor-pointer tabular-nums hover:opacity-80"
            >
              {a.gkpScore}
            </Badge>
          </Link>
        </TableCell>
        <TableCell className="hidden @xs:table-cell">
          <button
            type="button"
            onClick={() => onSetVisibility(a.id, !a.showOnWebsite)}
            title="Toggle visibility on the public site"
            className="inline-flex w-[72px] justify-start"
          >
            {a.showOnWebsite ? (
              <Badge variant="success">Live</Badge>
            ) : (
              <Badge variant="muted">Hidden</Badge>
            )}
          </button>
        </TableCell>
        <TableCell className="hidden @4xl:table-cell">
          <button
            type="button"
            disabled={!a.showOnWebsite}
            onClick={() => onSetFeatured(a.id, !a.featuredOnHome)}
            title={a.showOnWebsite ? "Feature in the home carousel" : "Set this artist to show on the website before featuring"}
            className="inline-flex w-[104px] justify-start disabled:cursor-not-allowed disabled:opacity-40"
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
        <TableCell className="hidden @6xl:table-cell whitespace-nowrap text-sm text-muted-foreground">
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
              <DropdownMenuItem onClick={() => onEdit(a.id)}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onViewReleases(a.id)}>
                <Eye className="mr-2 h-4 w-4" /> View releases
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onNewRelease({ id: a.id, name: a.name })}>
                <Plus className="mr-2 h-4 w-4" /> New release
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                onClick={() => onDelete({ id: a.id, name: a.name })}
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  },
  (prev, next) => prev.a === next.a && prev.selected === next.selected
);

export default function AdminArtistsClient({
  initialData,
  initialGenres,
}: {
  initialData: { items: AdminArtistRow[]; total: number } | null;
  initialGenres: string[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [items, setItems] = useState<AdminArtistRow[]>(initialData?.items ?? []);
  // Mirror the latest rows in a ref so the row-mutation handlers can read the
  // pre-optimistic list (for rollback) and a row's current flags without closing
  // over `items`. That keeps them safe to hand to the memoized ArtistRow, which may
  // hold an older closure for a row it skipped re-rendering.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ArtistSort>("sortOrder");
  const [dir, setDir] = useState<SortDir>("asc");
  const [visFilter, setVisFilter] = useState<"all" | "live" | "hidden">("all");
  const [featFilter, setFeatFilter] = useState<"all" | "featured" | "not">("all");
  const [genre, setGenre] = useState("");
  const [genreOptions, setGenreOptions] = useState<string[]>(initialGenres);
  const [loading, setLoading] = useState(!initialData);
  // Seed the cache with the server-rendered first page (under the default-view
  // key) so the initial load() finds it fresh and skips the client fetch — the
  // rows are already in the HTML. Runs once, before the load effect.
  useState(() => {
    if (initialData) {
      setCached(`artists?page=1&pageSize=${PAGE_SIZE}&sort=sortOrder&dir=asc`, {
        items: initialData.items,
        total: initialData.total,
      });
    }
    return null;
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [newReleaseFor, setNewReleaseFor] = useState<{ id: string; name: string } | null>(null);
  const [view, setView] = useState<"manage" | "order">("manage");

  // Debounce the search box → query (and reset to page 1).
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  // Bumped on every optimistic row mutation (visibility/featured toggle). A
  // background SWR revalidation (load) that was already in flight when the user
  // clicks returns pre-toggle data; applying it would repaint the just-flipped row
  // with its old value — the flicker where Featured briefly reverts, then snaps
  // back when the PATCH resolves. A load whose generation changed mid-fetch is
  // stale, so it discards its own response and lets the toggle's own optimistic
  // update (reconciled with the server by the PATCH) be the source of truth.
  const mutationGen = useRef(0);

  const load = useCallback(async () => {
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
    const qs = params.toString();
    // Stale-while-revalidate: if we've loaded this exact view before, paint the
    // cached rows immediately (no spinner) and refresh in the background.
    const cacheKey = `artists?${qs}`;
    const cached = getCached<{ items: AdminArtistRow[]; total: number }>(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setLoading(false);
      // Fresh enough → serve from cache only, skip the network entirely.
      if (isFresh(cacheKey)) return;
    } else {
      setLoading(true);
    }
    // Snapshot the mutation generation; if a toggle happens while this fetch is in
    // flight, the response is pre-toggle and must not overwrite the optimistic row.
    const gen = mutationGen.current;
    try {
      const res = await fetch(`/api/artists?${qs}`);
      if (!res.ok) throw new Error("Failed to load artists");
      const data = await res.json();
      if (gen !== mutationGen.current) return; // a toggle raced this load — discard stale data
      setItems(data.items);
      setTotal(data.total);
      setSelected(new Set());
      setCached(cacheKey, { items: data.items, total: data.total });
    } catch (e) {
      console.error(e);
      if (!cached) toast.error("Failed to load artists");
    } finally {
      setLoading(false);
    }
  }, [page, query, sort, dir, visFilter, featFilter, genre, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Load distinct genres once for the filter dropdown — unless the server already
  // provided them with the initial render.
  useEffect(() => {
    if (initialData) return; // genres came from the server alongside initialData
    fetch("/api/admin/artists/genres")
      .then((r) => (r.ok ? r.json() : { genres: [] }))
      .then((d) => setGenreOptions(d.genres || []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Adopt the server's authoritative flags for one row from a PATCH response, so
  // the on-screen row can never drift from what was actually persisted. This is
  // what keeps Featured honest through hide/unhide: the server drops Featured when
  // an artist is hidden and does NOT restore it on unhide, and reading that back
  // here stops the stale "Featured" badge that otherwise lingered until a refresh.
  const applyServerRow = (
    id: string,
    updated: { showOnWebsite?: unknown; featuredOnHome?: unknown; homeOrder?: unknown } | null
  ) => {
    if (!updated || typeof updated.featuredOnHome !== "boolean") return;
    setItems((list) =>
      list.map((a) =>
        a.id === id
          ? {
              ...a,
              showOnWebsite:
                typeof updated.showOnWebsite === "boolean" ? updated.showOnWebsite : a.showOnWebsite,
              featuredOnHome: updated.featuredOnHome as boolean,
              homeOrder: typeof updated.homeOrder === "number" ? updated.homeOrder : a.homeOrder,
            }
          : a
      )
    );
  };

  const setVisibility = async (id: string, showOnWebsite: boolean) => {
    const prev = itemsRef.current;
    // Mirror the server rule locally and immediately: hiding an artist also drops
    // it from the Featured set (a hidden artist can't be featured). Without this the
    // row kept a stale "Featured" badge after hide, which then read as inconsistent
    // against the Featured Artists order until a manual refresh.
    setItems((list) =>
      list.map((a) =>
        a.id === id
          ? { ...a, showOnWebsite, featuredOnHome: showOnWebsite ? a.featuredOnHome : false }
          : a
      )
    );
    mutationGen.current++; // stale in-flight loads must not revert this row
    try {
      const res = await fetch(`/api/artists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnWebsite }),
      });
      if (!res.ok) throw new Error();
      applyServerRow(id, await res.json().catch(() => null));
      clearCached(); // persisted change — keep cached views honest on revisit
    } catch {
      setItems(prev);
      toast.error("Failed to update visibility");
    }
  };

  const setFeatured = async (id: string, featuredOnHome: boolean) => {
    const prev = itemsRef.current;
    const row = itemsRef.current.find((a) => a.id === id);
    setItems((list) => list.map((a) => (a.id === id ? { ...a, featuredOnHome } : a)));
    mutationGen.current++; // stale in-flight loads must not revert this row
    try {
      // When featuring a row the admin sees as visible, assert showOnWebsite in the
      // same request. The server's "only visible artists can be Featured" guard reads
      // a LIVE DB value that can disagree with the (cached) row on screen, so a
      // visibly-Live artist could be wrongly rejected as "not visible". Sending it
      // keeps the server in step with what the admin acted on. A row shown as Hidden
      // still omits it, so the "show it on the website first" guard stays intact.
      const body: Record<string, unknown> = { featuredOnHome };
      if (featuredOnHome && row?.showOnWebsite) body.showOnWebsite = true;
      const res = await fetch(`/api/artists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || "Failed to update featured");
      }
      // Optimistic-only, mirroring the Press page's toggle: the row already shows the
      // new state from the setItems above. Re-reading the server's row here (as
      // setVisibility does, where hiding also drops Featured) forced a SECOND
      // full-table re-render after the network round-trip — the "changes, then updates
      // again after a delay" lag. Featuring only flips one boolean, so the optimistic
      // value is authoritative; just drop the cached views so a later revisit
      // re-fetches the server's order.
      clearCached();
    } catch (e) {
      setItems(prev);
      toast.error(e instanceof Error ? e.message : "Failed to update featured");
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
      unlockBody(); // delete dialog opens from a DropdownMenu — clear any leftover Radix body lock
      clearCached(); // row count/pages changed — drop stale cached views
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
      unlockBody(); // clear any leftover Radix body lock (see confirmDelete)
      clearCached(); // bulk show/hide/delete changed rows — invalidate cache
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
        description="Your artist roster. Add and edit artists, control whether each shows on the public site, feature them on the home page, and set the order shown on the site."
        actions={
          <Button asChild className="bg-white text-black hover:bg-gray-200">
            <Link href="/admin/artists/new">
              <Plus className="h-4 w-4" />
              New artist
            </Link>
          </Button>
        }
      />

      {/* View toggle: filtered table vs manual custom order */}
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {([["manage", "Manage"], ["order", "Custom order"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setView(k);
              // Reflect any reordering just made. The Custom-order panel saves the new
              // order straight to the DB, bypassing this list's cache — so drop the
              // cached views before reloading, otherwise Manage keeps showing the
              // pre-reorder order (served from the still-"fresh" client cache).
              if (k === "manage") {
                clearCached();
                load();
              }
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
          ? "Drag artists into the order they should appear on the site (and in this list)."
          : "Browse, search and edit artists. Switch to “Custom order” to set the order they appear on the site."}
      </p>

      {view === "order" ? (
        <ManualOrderPanel
          loadEndpoint="/api/admin/artists/reorder"
          saveEndpoint="/api/admin/artists/reorder"
          kind="artist"
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
      <div className="@container rounded-xl border border-border bg-card">
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
              <TableHead className="hidden @lg:table-cell">Genre</TableHead>
              <TableHead className="hidden @2xl:table-cell text-right">
                <span className="inline-flex items-center gap-1"><Disc3 className="h-3.5 w-3.5" /> Releases</span>
              </TableHead>
              <TableHead className="hidden @5xl:table-cell text-right">
                <span className="inline-flex items-center gap-1"><Play className="h-3.5 w-3.5" /> Plays 90d</span>
              </TableHead>
              <TableHead className="hidden @7xl:table-cell">
                <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Last release</span>
              </TableHead>
              <TableHead className="hidden @xl:table-cell">
                <span className="inline-flex items-center gap-1">SEO <InfoHint text="Per-artist SEO score (0–100) from the fields that drive search ranking: streaming/social links, MusicBrainz ID, ISNI, bio, photo, genres and releases. The badge shows the highest-impact gaps — click it to fill them." /></span>
              </TableHead>
              <TableHead className="hidden @3xl:table-cell">
                <span className="inline-flex items-center gap-1">GKP <InfoHint text="Google Knowledge Panel readiness (0–100): how ready this artist is to earn a Knowledge Panel — the entity info box shown beside Google results. Unlike the SEO score (page discoverability), this grades entity identity: a Wikidata item, MusicBrainz ID and ISNI, plus streaming/social links (sameAs), a release and a bio — the signals Google's Knowledge Graph uses to confirm a distinct real-world artist. The badge shows the highest-impact gap; click it to fill them in." /></span>
              </TableHead>
              <TableHead className="hidden @xs:table-cell">
                <span className="inline-flex items-center gap-1">Visibility <InfoHint text="Whether this artist appears on the public site. Hidden artists aren’t shown to visitors." /></span>
              </TableHead>
              <TableHead className="hidden @4xl:table-cell">
                <span className="inline-flex items-center gap-1">Featured <InfoHint text="Feature this artist in the home page carousel. Set the carousel order on the Homepage screen." /></span>
              </TableHead>
              <TableHead className="hidden @6xl:table-cell">
                <button type="button" onClick={() => toggleSort("createdAt")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Added {sortIcon("createdAt")}
                </button>
              </TableHead>
              <TableHead className="w-10 text-right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden @lg:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden @2xl:table-cell"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                  <TableCell className="hidden @5xl:table-cell"><Skeleton className="ml-auto h-4 w-10" /></TableCell>
                  <TableCell className="hidden @7xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="hidden @xl:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden @3xl:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden @xs:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="hidden @4xl:table-cell"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="hidden @6xl:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="py-12 text-center text-muted-foreground">
                  {query ? `No artists match “${query}”.` : "No artists yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((a) => (
                <ArtistRow
                  key={a.id}
                  a={a}
                  selected={selected.has(a.id)}
                  onToggleSelect={toggleSelect}
                  onSetVisibility={setVisibility}
                  onSetFeatured={setFeatured}
                  onEdit={(id) => router.push(`/admin/artists/${id}/edit`)}
                  onViewReleases={(id) => router.push(`/admin/artist/${id}`)}
                  onNewRelease={setNewReleaseFor}
                  onDelete={setDeleteTarget}
                />
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
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); unlockBody(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete artist</DialogTitle>
            <DialogDescription>
              Delete this artist? This also removes their releases where they are
              the sole primary artist. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {/* Name in its own bounded block so a long name can't overflow the
              dialog or push the buttons out of reach. */}
          <p className="line-clamp-2 break-words rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
            {deleteTarget?.name}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteTarget(null); unlockBody(); }} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {newReleaseFor ? (
        <NewReleaseDialog
          open={!!newReleaseFor}
          onOpenChange={(o) => !o && setNewReleaseFor(null)}
          presetArtist={newReleaseFor}
        />
      ) : null}

      {/* Bulk delete dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={(o) => { setBulkDeleteOpen(o); if (!o) unlockBody(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} artists</DialogTitle>
            <DialogDescription>
              This deletes the selected artists and their sole-primary releases.
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkDeleteOpen(false); unlockBody(); }} disabled={working}>
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
