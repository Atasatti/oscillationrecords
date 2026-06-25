"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Send,
  EyeOff,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import NewReleaseDialog from "@/components/admin/NewReleaseDialog";
import ManualOrderPanel from "@/components/admin/ManualOrderPanel";
import InfoHint from "@/components/admin/InfoHint";
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
import { getCached, setCached, clearCached, isFresh } from "@/lib/admin-cache";
import { buildHarmonyReleaseUrl, canSeedRelease } from "@/lib/musicbrainz-seed";

const PAGE_SIZE = 25;

type StatusTab = "all" | "RELEASED" | "SCHEDULED" | "DRAFT";

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "RELEASED", label: "Live" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "DRAFT", label: "Drafts" },
];

function kindLabel(type: ReleaseCardDTO["type"]) {
  return type === "album" ? "Album" : type === "ep" ? "EP" : "Single";
}

function toStatusTab(value: string | null): StatusTab {
  const v = (value || "").toUpperCase();
  return v === "DRAFT" || v === "SCHEDULED" || v === "RELEASED" ? (v as StatusTab) : "all";
}

function ReleasesPageInner({
  initialData,
}: {
  initialData: { items: ReleaseCardDTO[]; total: number } | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ReleaseCardDTO[]>(initialData?.items ?? []);
  // Releases with a home/latest flag write currently in flight. A ref is the
  // hard guard (synchronous, beats rapid double-clicks); the state mirror drives
  // the disabled UI. One flag write per release at a time → no overlapping PATCH
  // transactions on the same row, which is what triggers Prisma P2034 conflicts.
  const pendingFlagRef = useRef<Set<string>>(new Set());
  const [pendingFlags, setPendingFlags] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(initialData?.total ?? 0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReleaseSort>("sortOrder");
  const [dir, setDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusTab>(
    toStatusTab(searchParams.get("status"))
  );
  const [loading, setLoading] = useState(!initialData);
  // Seed the cache with the server-rendered first page under the key load() will
  // build for this initial status tab, so the first load() skips the fetch. The
  // server fetched for the SAME status (both derive it from the URL), so the data
  // matches the initial statusFilter.
  useState(() => {
    if (initialData) {
      const params = new URLSearchParams({
        page: "1",
        pageSize: String(PAGE_SIZE),
        sort: "sortOrder",
        dir: "asc",
      });
      if (statusFilter !== "all") params.set("status", statusFilter);
      setCached(`releases?${params.toString()}`, {
        items: initialData.items,
        total: initialData.total,
      });
    }
    return null;
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<{ DRAFT: number; SCHEDULED: number }>({
    DRAFT: 0,
    SCHEDULED: 0,
  });
  const [newOpen, setNewOpen] = useState(false);
  const [view, setView] = useState<"manage" | "order">("manage");

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [queryInput]);

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort,
      dir,
    });
    if (query) params.set("q", query);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString();
    // Stale-while-revalidate: show the last-loaded view instantly on revisit,
    // then refresh in the background instead of a blank spinner + full refetch.
    const cacheKey = `releases?${qs}`;
    const cached = getCached<{ items: ReleaseCardDTO[]; total: number }>(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setLoading(false);
      // Fresh enough → serve from cache only, skip the network entirely.
      if (isFresh(cacheKey)) return;
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/releases?${qs}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setSelected(new Set());
      setCached(cacheKey, { items: data.items, total: data.total });
      // If a delete emptied the current page (e.g. the last row on the last
      // page), clamp back to the last valid page instead of a stuck empty table.
      const lastPage = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
    } catch {
      if (!cached) toast.error("Failed to load releases");
    } finally {
      setLoading(false);
    }
  }, [page, query, sort, dir, statusFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Tab counts for the actionable statuses (Drafts / Scheduled).
  const loadCounts = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([
        fetch("/api/releases?status=DRAFT&pageSize=1").then((r) => (r.ok ? r.json() : { total: 0 })),
        fetch("/api/releases?status=SCHEDULED&pageSize=1").then((r) => (r.ok ? r.json() : { total: 0 })),
      ]);
      setCounts({ DRAFT: d.total || 0, SCHEDULED: s.total || 0 });
    } catch {
      /* counts are best-effort */
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

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

  const allSelected = items.length > 0 && items.every((r) => selected.has(r.id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((r) => r.id)));
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // A release is "live" (eligible for the Latest pill) when it's RELEASED, or a
  // SCHEDULED release whose date has arrived. Drafts / not-yet-due are not.
  const isLiveRelease = (r: { status: string; releaseDate: string | null }) =>
    r.status === "RELEASED" ||
    (r.status === "SCHEDULED" &&
      !!r.releaseDate &&
      new Date(r.releaseDate).getTime() <= Date.now());

  const patchFlag = async (
    id: string,
    key: "showOnHome" | "showLatestOnHome",
    value: boolean
  ) => {
    // Ignore clicks while this release already has a flag write in flight — both
    // toggles are disabled meanwhile, but this also blocks any synchronous
    // double-fire. Prevents overlapping PATCH transactions (Prisma P2034).
    if (pendingFlagRef.current.has(id)) return;
    pendingFlagRef.current.add(id);
    setPendingFlags(new Set(pendingFlagRef.current));

    const prev = items;
    // "Latest" now supports multiple releases — no single-select clearing.
    setItems((list) => list.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
    try {
      const res = await fetch(`/api/releases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to update");
      }
      clearCached(); // persisted change — keep cached views honest on revisit
    } catch (e) {
      setItems(prev);
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      pendingFlagRef.current.delete(id);
      setPendingFlags(new Set(pendingFlagRef.current));
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
      clearCached();
      load();
      loadCounts();
    } catch {
      toast.error("Failed to delete release");
    } finally {
      setWorking(false);
    }
  };

  const confirmBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setWorking(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/releases/${id}`, { method: "DELETE" }))
      );
      const failed = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)
      ).length;
      if (failed > 0) {
        toast.error(`Deleted ${ids.length - failed}; ${failed} failed.`);
      } else {
        toast.success(`Deleted ${ids.length} release${ids.length === 1 ? "" : "s"}`);
      }
      setBulkDeleteOpen(false);
      setSelected(new Set());
      clearCached();
      load();
      loadCounts();
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setWorking(false);
    }
  };

  // Bulk publish / unpublish the selected releases. Publishing skips any with no
  // tracks (they'd otherwise go live empty); moving to draft is always safe.
  const bulkSetStatus = async (status: "RELEASED" | "DRAFT") => {
    const targets = items.filter((r) => selected.has(r.id));
    if (targets.length === 0) return;
    const actionable = status === "RELEASED" ? targets.filter((r) => r.songCount > 0) : targets;
    const skipped = targets.length - actionable.length;
    if (actionable.length === 0) {
      toast.error("None of the selected releases have tracks to publish.");
      return;
    }
    setWorking(true);
    try {
      const results = await Promise.allSettled(
        actionable.map((r) =>
          fetch(`/api/releases/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      const failed = results.filter(
        (x) => x.status === "rejected" || (x.status === "fulfilled" && !x.value.ok)
      ).length;
      const ok = actionable.length - failed;
      const verb = status === "RELEASED" ? "Published" : "Moved to draft";
      let msg = `${verb} ${ok}`;
      if (failed) msg += `, ${failed} failed`;
      if (skipped) msg += `, skipped ${skipped} with no tracks`;
      if (failed) toast.error(msg);
      else toast.success(msg);
      setSelected(new Set());
      clearCached();
      load();
      loadCounts();
    } catch {
      toast.error("Bulk update failed");
    } finally {
      setWorking(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <div>
      <PageHeader
        title="Releases"
        description="Every release in your catalog. Create new ones, edit details and tracks, set status (Draft / Scheduled / Live), feature them on the home page, and set the order shown on the site."
        actions={
          <Button className="bg-white text-black hover:bg-gray-200" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New release
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
              if (k === "manage") load(); // reflect any reordering just made
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
          ? "Drag releases into the order they should appear on the site (and in this list)."
          : "Browse, search and edit releases. Use the tabs to filter by status; switch to “Custom order” to set their order on the site."}
      </p>

      {view === "order" ? (
        <ManualOrderPanel
          loadEndpoint="/api/admin/releases/reorder"
          saveEndpoint="/api/admin/releases/reorder"
          kind="release"
        />
      ) : (
      <>
      {/* Status tabs */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {STATUS_TABS.map(({ key, label }) => {
          const count = key === "DRAFT" ? counts.DRAFT : key === "SCHEDULED" ? counts.SCHEDULED : 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setStatusFilter(key);
                setPage(1);
              }}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                statusFilter === key
                  ? "border-white text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {count > 0 ? (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] tabular-nums text-foreground">
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Search */}
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
      </div>

      {/* Bulk action bar */}
      {selectedCount > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5">
          <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
          <Button variant="outline" size="sm" disabled={working} onClick={() => bulkSetStatus("RELEASED")}>
            <Send className="mr-1 h-4 w-4" /> Publish
          </Button>
          <Button variant="outline" size="sm" disabled={working} onClick={() => bulkSetStatus("DRAFT")}>
            <EyeOff className="mr-1 h-4 w-4" /> Move to draft
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={working}
            onClick={() => setBulkDeleteOpen(true)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      ) : null}

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
                  Release {sortIcon("name")}
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">Artist</TableHead>
              <TableHead>
                <button type="button" onClick={() => toggleSort("kind")} className="inline-flex items-center gap-1 hover:text-foreground">
                  Type {sortIcon("kind")}
                </button>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Status <InfoHint text="Draft = hidden. Scheduled = future-dated, shows in Coming Soon. Live = public." /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">Latest <InfoHint text="Shows a 'Latest' badge on the home page. Only one release can be Latest at a time — turning it on clears the others." /></span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">New Music <InfoHint text="Feature this release in the home page's New Music carousel. Set the carousel order on the Homepage screen." /></span>
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                <span className="inline-flex items-center gap-1">SEO <InfoHint text="Per-release SEO score (0–100) from the fields that drive search ranking and rich results: streaming links, description, cover image, tracklist, genres, release date and primary artist. The badge shows the highest-impact gap — click it to fill it." /></span>
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
                      <Skeleton className="h-12 w-12 rounded" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                  {query ? `No releases match “${query}”.` : "No releases here yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      aria-label={`Select ${r.name}`}
                      className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/catalog/releases/${r.id}/edit`} className="flex items-center gap-3 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.thumbnail || "/new-music-img1.svg"}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-lg object-cover"
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
                    <button
                      type="button"
                      disabled={!isLiveRelease(r) || pendingFlags.has(r.id)}
                      onClick={() => patchFlag(r.id, "showLatestOnHome", !r.showLatestOnHome)}
                      title={isLiveRelease(r) ? "Show the 'Latest' pill on home" : "Only released / live releases can be a Latest Release"}
                      className="disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {r.showLatestOnHome ? <Badge variant="destructive">Latest</Badge> : <Badge variant="muted">Off</Badge>}
                    </button>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={r.status === "DRAFT" || pendingFlags.has(r.id)}
                      onClick={() => patchFlag(r.id, "showOnHome", !r.showOnHome)}
                      title={r.status === "DRAFT" ? "Publish this release before adding it to New Music" : "Feature in the New Music carousel"}
                      className="disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {r.showOnHome ? <Badge variant="warning"><Star className="h-3 w-3" /> On</Badge> : <Badge variant="muted">Off</Badge>}
                    </button>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {r.seoScore === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Link
                        href={`/admin/catalog/releases/${r.id}/edit`}
                        title={
                          r.seoComplete
                            ? "All key SEO fields filled"
                            : `To improve SEO, add: ${r.seoMissing.join(", ")} — click to edit`
                        }
                        className="inline-flex"
                      >
                        <Badge
                          variant={
                            r.seoGrade === "strong"
                              ? "success"
                              : r.seoGrade === "good"
                                ? "warning"
                                : "destructive"
                          }
                          className="cursor-pointer tabular-nums hover:opacity-80"
                        >
                          SEO {r.seoScore}
                          {!r.seoComplete && r.seoMissing.length ? (
                            <span className="font-normal opacity-80">· add {r.seoMissing[0]}</span>
                          ) : null}
                        </Badge>
                      </Link>
                    )}
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

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedCount} releases</DialogTitle>
            <DialogDescription>
              This deletes the selected releases and all of their tracks. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmBulkDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete {selectedCount}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewReleaseDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

export default function AdminReleasesClient({
  initialData,
}: {
  initialData: { items: ReleaseCardDTO[]; total: number } | null;
}) {
  return (
    <Suspense fallback={null}>
      <ReleasesPageInner initialData={initialData} />
    </Suspense>
  );
}
