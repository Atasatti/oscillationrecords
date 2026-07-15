"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Upload, Trash2, Pencil, Loader2, Download, Music, FileText, FileArchive, Film, File as FileIcon,
  Image as ImageIcon, ExternalLink, Eye, Search, List, LayoutGrid, FolderInput, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import Segmented from "@/components/admin/ui/Segmented";
import {
  ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, ASSET_ACCEPT, formatBytes, isUsableFileUrl, type AssetCategory,
} from "@/lib/asset";
import AssetActions from "@/components/admin/AssetActions";
import { groupAssets, buildDownloadItems, type GroupMode } from "@/lib/asset-grouping";

const BROWSE_OPTIONS: { key: GroupMode; label: string }[] = [
  { key: "release", label: "Release" },
  { key: "artist", label: "Artist" },
  { key: "type", label: "Type" },
  { key: "month", label: "Month" },
];

export type Asset = {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  /** Same-origin href that forces a real download (presigned S3 + Content-
   *  Disposition) for our own files; falls back to fileUrl for external URLs.
   *  Use this for the Download action — fileUrl is for open/preview only. */
  downloadHref: string;
  mimeType: string;
  size: number;
  releaseId: string | null;
  artistId: string | null;
  notes: string | null;
  createdAt: string;
  uploader: string | null;
  /** "upload" = added via the DAM (editable); the rest are read-only catalog
   *  media surfaced from the record they live on. */
  source: "upload" | "release" | "artist" | "press";
  readOnly: boolean;
  parentHref: string | null;
  parentLabel: string | null;
};

export type Option = { id: string; name: string };

type Filter = "all" | AssetCategory;

const CAT_PILL: Record<string, string> = {
  master: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  artwork: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  stems: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  press_photo: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  epk: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  document: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  other: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

const inputCls =
  "rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function AssetGlyph({ mime, className }: { mime: string; className?: string }) {
  if (/^audio\//.test(mime)) return <Music className={className} />;
  if (/^video\//.test(mime)) return <Film className={className} />;
  if (mime === "application/pdf") return <FileText className={className} />;
  if (/zip/.test(mime)) return <FileArchive className={className} />;
  if (/^image\//.test(mime)) return <ImageIcon className={className} />;
  return <FileIcon className={className} />;
}

type UploadRow = { status: "queued" | "uploading" | "done" | "error"; pct: number; error?: string };

function putWithProgress(url: string, file: File, onPct: (n: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onPct(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });
}

export default function AssetsClient({
  initial, releases, artists, releaseLyrics = {}, releaseArtistId = {},
}: {
  initial: Asset[];
  releases: Option[];
  artists: Option[];
  releaseLyrics?: Record<string, { txt: boolean; lrc: boolean }>;
  releaseArtistId?: Record<string, string>;
}) {
  const toast = useToast();
  const { data: session } = useSession();
  const myName = session?.user?.name || session?.user?.email || null;
  const [assets, setAssets] = useState<Asset[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupMode>("release");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "grid">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "type" | "release" | "artist" | "size" | "date">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignRelease, setReassignRelease] = useState("");
  const [reassignArtist, setReassignArtist] = useState("");

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [prog, setProg] = useState<UploadRow[]>([]);
  // Editable asset name (title) per queued file, so it can be set at upload time
  // instead of only via Edit afterwards. Defaults to the filename; parallel to `files`.
  const [titles, setTitles] = useState<string[]>([]);
  const [uploadCategory, setUploadCategory] = useState<AssetCategory>("master");
  const [uploadReleaseId, setUploadReleaseId] = useState("");
  const [uploadArtistId, setUploadArtistId] = useState("");
  const [uploading, setUploading] = useState(false);

  // Edit dialog
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<Asset | null>(null);
  const [form, setForm] = useState({ title: "", category: "other" as AssetCategory, releaseId: "", artistId: "", notes: "" });
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [working, setWorking] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of releases) m.set(r.id, r.name);
    for (const a of artists) m.set(a.id, a.name);
    return m;
  }, [releases, artists]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: assets.length };
    for (const a of assets) c[a.category] = (c[a.category] ?? 0) + 1;
    return c;
  }, [assets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter(
      (a) =>
        (filter === "all" || a.category === filter) &&
        (!q || a.title.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q))
    );
  }, [assets, filter, search]);

  const releaseNames = useMemo(() => new Map(releases.map((r) => [r.id, r.name])), [releases]);
  const artistNames = useMemo(() => new Map(artists.map((a) => [a.id, a.name])), [artists]);
  const groupCtx = useMemo(
    () => ({
      releaseNames,
      artistNames,
      releaseArtistId: new Map(Object.entries(releaseArtistId)),
      categoryLabels: ASSET_CATEGORY_LABELS as Record<string, string>,
    }),
    [releaseNames, artistNames, releaseArtistId]
  );
  const groups = useMemo(() => groupAssets(visible, groupBy, groupCtx), [visible, groupBy, groupCtx]);

  // Centre-pane rows: the selected folder's assets (or everything), sorted.
  const rows = useMemo(() => {
    const grp = activeGroup ? groups.find((g) => g.key === activeGroup) : null;
    const base = grp ? grp.assets : visible;
    const relName = (a: Asset) => (a.releaseId ? nameOf.get(a.releaseId) : "") ?? "";
    const artName = (a: Asset) => (a.artistId ? nameOf.get(a.artistId) : "") ?? "";
    const cmp = (x: Asset, y: Asset) => {
      let v = 0;
      switch (sortBy) {
        case "name": v = x.title.localeCompare(y.title); break;
        case "type": v = x.category.localeCompare(y.category); break;
        case "release": v = relName(x).localeCompare(relName(y)); break;
        case "artist": v = artName(x).localeCompare(artName(y)); break;
        case "size": v = x.size - y.size; break;
        default: v = x.createdAt.localeCompare(y.createdAt);
      }
      return sortDir === "asc" ? v : -v;
    };
    return [...base].sort(cmp);
  }, [activeGroup, groups, visible, sortBy, sortDir, nameOf]);

  const activeAsset = useMemo(() => assets.find((a) => a.id === activeId) ?? null, [assets, activeId]);

  // Detail side panel: dismiss with Esc or an outside click, so it never gets
  // stuck open. Esc defers to any open dialog (Radix owns Escape while a modal is
  // up). An outside click ignores asset rows/cards (data-asset-item) so switching
  // the selection to another item just re-targets the panel instead of closing it.
  const detailRef = useRef<HTMLElement | null>(null);
  const closeDetail = () => setActiveId(null);
  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return; // a dialog is up
      setActiveId(null);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (detailRef.current?.contains(target)) return; // inside the panel
      if (target.closest("[data-asset-item]")) return; // clicking another item re-targets it
      setActiveId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [activeId]);
  // When a release folder is selected, offer a "download everything for this release" menu
  // (its files + synthesized lyrics) — the consolidated-download feature, surfaced in context.
  const activeReleaseGroup = useMemo(
    () => (activeGroup ? groups.find((g) => g.key === activeGroup && g.kind === "release" && !!g.entityId) ?? null : null),
    [activeGroup, groups]
  );

  const changeGroupBy = (mode: GroupMode) => { setGroupBy(mode); setActiveGroup(null); };
  const sortByCol = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortDir(col === "date" || col === "size" ? "desc" : "asc"); }
  };
  const toggleSelect = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allRowsSelected = rows.length > 0 && rows.every((a) => selected.has(a.id));
  const toggleSelectAll = () => setSelected(allRowsSelected ? new Set() : new Set(rows.map((a) => a.id)));
  const selectedAssets = () => assets.filter((a) => selected.has(a.id));

  const bulkDownload = () => {
    for (const a of selectedAssets()) {
      const el = document.createElement("a");
      el.href = a.fileUrl; el.download = a.fileName; el.target = "_blank"; el.rel = "noopener noreferrer";
      document.body.appendChild(el); el.click(); el.remove();
    }
  };
  const bulkDelete = async () => {
    const editable = selectedAssets().filter((a) => !a.readOnly);
    if (editable.length === 0) { toast.error("Only uploaded files can be deleted — catalog media is managed on its record"); return; }
    setWorking(true);
    let ok = 0;
    for (const a of editable) {
      try { const r = await fetch(`/api/assets/${a.id}`, { method: "DELETE" }); if (r.ok) ok += 1; } catch { /* skip */ }
    }
    const ids = new Set(editable.map((a) => a.id));
    setAssets((list) => list.filter((x) => !ids.has(x.id)));
    setSelected(new Set());
    setWorking(false);
    toast.success(`Deleted ${ok} file${ok === 1 ? "" : "s"}`);
  };
  const applyReassign = async () => {
    const editable = selectedAssets().filter((a) => !a.readOnly);
    if (editable.length === 0) { toast.error("Only uploaded files can be reassigned"); setReassignOpen(false); return; }
    const body: Record<string, unknown> = {};
    if (reassignRelease) body.releaseId = reassignRelease === "__none__" ? null : reassignRelease;
    if (reassignArtist) body.artistId = reassignArtist === "__none__" ? null : reassignArtist;
    if (Object.keys(body).length === 0) { setReassignOpen(false); return; }
    setWorking(true);
    for (const a of editable) {
      try {
        const r = await fetch(`/api/assets/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.asset) setAssets((list) => list.map((x) => (x.id === a.id ? { ...x, ...j.asset } : x)));
      } catch { /* skip */ }
    }
    setWorking(false);
    setReassignOpen(false);
    setSelected(new Set());
    setReassignRelease("");
    setReassignArtist("");
    toast.success(`Reassigned ${editable.length} file${editable.length === 1 ? "" : "s"}`);
  };

  const setRow = (i: number, patch: Partial<UploadRow>) =>
    setProg((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const pickFiles = (list: FileList | null) => {
    const fs = Array.from(list ?? []);
    setFiles(fs);
    setProg(fs.map(() => ({ status: "queued" as const, pct: 0 })));
    setTitles(fs.map((f) => f.name)); // pre-fill the name field with the filename
  };

  const openUpload = () => {
    setFiles([]); setProg([]); setTitles([]); setUploadReleaseId(""); setUploadArtistId(""); setUploadOpen(true);
  };

  const startUpload = async () => {
    if (uploading || files.length === 0) return;
    setUploading(true);
    const created: Asset[] = [];
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
      // Never re-upload a file that already succeeded — a retry after a partial
      // failure must only re-attempt the outstanding rows, or we'd mint duplicate
      // S3 objects + Asset rows.
      if (prog[i]?.status === "done") continue;
      const file = files[i];
      if (!file) continue;
      setRow(i, { status: "uploading", pct: 0 });
      try {
        const pres = await fetch("/api/assets/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, fileType: file.type || "application/octet-stream", category: uploadCategory }),
        });
        if (!pres.ok) {
          const j = await pres.json().catch(() => ({}));
          throw new Error(j?.error || "Couldn't start upload");
        }
        const { uploadURL, fileKey } = await pres.json();
        await putWithProgress(uploadURL, file, (pct) => setRow(i, { status: "uploading", pct }));
        const res = await fetch("/api/assets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Admin-set name (falls back to the filename if left blank).
            fileKey, fileName: file.name, title: titles[i]?.trim() || file.name, category: uploadCategory,
            releaseId: uploadReleaseId || null, artistId: uploadArtistId || null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "Couldn't save");
        }
        const { asset } = await res.json();
        // A freshly uploaded file always lives in our own bucket, so give it the
        // same-origin download shim (real download) and the client-only fields the
        // API row doesn't carry — otherwise the new card would render with a broken
        // Download link until the next full page load.
        created.push({
          ...asset,
          uploader: myName,
          source: "upload",
          readOnly: false,
          parentHref: null,
          parentLabel: null,
          downloadHref: `/api/assets/download?url=${encodeURIComponent(asset.fileUrl)}&name=${encodeURIComponent(asset.fileName)}`,
        });
        setRow(i, { status: "done", pct: 100 });
      } catch (e) {
        failed += 1;
        setRow(i, { status: "error", pct: 0, error: e instanceof Error ? e.message : "Failed" });
      }
    }
    if (created.length) setAssets((list) => [...created.slice().reverse(), ...list]);
    setUploading(false);
    if (failed === 0) {
      if (created.length) toast.success(`${created.length} file${created.length === 1 ? "" : "s"} uploaded`);
      setUploadOpen(false);
    } else {
      toast.error(`${failed} file${failed === 1 ? "" : "s"} failed — see the list`);
    }
  };

  const openEdit = (a: Asset) => {
    setEditingId(a.id);
    setEditOriginal(a);
    setForm({
      title: a.title,
      category: (ASSET_CATEGORIES as readonly string[]).includes(a.category) ? (a.category as AssetCategory) : "other",
      releaseId: a.releaseId ?? "",
      artistId: a.artistId ?? "",
      notes: a.notes ?? "",
    });
    setEditorOpen(true);
  };

  const save = async () => {
    if (saving || !editingId || !editOriginal) return;
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    const o = editOriginal;
    const diff: Record<string, unknown> = {};
    if (form.title.trim() !== o.title) diff.title = form.title.trim();
    if (form.category !== o.category) diff.category = form.category;
    if ((form.releaseId || null) !== o.releaseId) diff.releaseId = form.releaseId || null;
    if ((form.artistId || null) !== o.artistId) diff.artistId = form.artistId || null;
    if (form.notes !== (o.notes ?? "")) diff.notes = form.notes;
    if (Object.keys(diff).length === 0) { setEditorOpen(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diff),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      const saved: Asset = { ...o, ...j.asset };
      setAssets((list) => list.map((x) => (x.id === editingId ? saved : x)));
      setEditorOpen(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/assets/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAssets((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete asset");
    } finally {
      setWorking(false);
    }
  };

  // Files still needing upload (queued or errored — not the ones already done).
  const pendingCount = files.filter((_, i) => (prog[i]?.status ?? "queued") !== "done").length;
  const hasUploadErrors = prog.some((r) => r.status === "error");

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...ASSET_CATEGORIES.map((c) => ({ key: c, label: ASSET_CATEGORY_LABELS[c] })),
  ];

  // One asset card — shared by the flat grid and every grouped section.
  const renderCard = (a: Asset) => {
    const rel = a.releaseId ? nameOf.get(a.releaseId) : null;
    const art = a.artistId ? nameOf.get(a.artistId) : null;
    const hasFile = isUsableFileUrl(a.fileUrl);
    const isImg = hasFile && /^image\//.test(a.mimeType);
    const thumbClass = "flex h-32 items-center justify-center overflow-hidden border-b border-border bg-black/20";
    const thumbInner = isImg ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={a.fileUrl} alt="" className="h-full w-full object-cover" />
    ) : (
      <AssetGlyph mime={a.mimeType} className="h-10 w-10 text-muted-foreground" />
    );
    return (
      <div key={a.id} data-asset-item className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
        {hasFile ? (
          <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className={thumbClass}>
            {thumbInner}
          </a>
        ) : (
          <div className={thumbClass}>{thumbInner}</div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAT_PILL[a.category] ?? CAT_PILL.other}`}>
              {ASSET_CATEGORY_LABELS[a.category as AssetCategory] ?? a.category}
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{formatBytes(a.size)}</span>
          </div>
          <p className="truncate text-sm font-medium" title={a.title}>{a.title}</p>
          {a.fileName !== a.title ? <p className="truncate text-xs text-muted-foreground" title={a.fileName}>{a.fileName}</p> : null}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {a.readOnly && a.parentLabel ? (
              <span className="inline-flex items-center gap-1">
                <span className="rounded border border-border px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">{a.source}</span>
                <span className="truncate">{a.parentLabel}</span>
              </span>
            ) : (
              <>
                {rel ? <span>Release: {rel}</span> : null}
                {art ? <span>Artist: {art}</span> : null}
              </>
            )}
          </div>
          {a.notes ? <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-gray-400">{a.notes}</p> : null}
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="truncate text-[11px] text-muted-foreground">
              {fmtDate(a.createdAt)}{a.uploader ? ` · ${a.uploader}` : ""}
            </span>
            <div className="flex shrink-0 items-center gap-0.5">
              {hasFile ? (
                <>
                  <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" title="Open (preview)" aria-label="Open (preview)"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                  <a href={a.downloadHref} download={a.fileName} title="Download" aria-label="Download"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </>
              ) : (
                <span title="No file available" aria-label="No file available" aria-disabled="true"
                  className="rounded p-1.5 cursor-not-allowed text-muted-foreground/40">
                  <Download className="h-3.5 w-3.5" />
                </span>
              )}
              {a.readOnly ? (
                a.parentHref ? (
                  <Link href={a.parentHref} title="Manage on its record" aria-label="Manage on its record"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                ) : null
              ) : (
                <>
                  <button type="button" onClick={() => openEdit(a)} title="Edit" aria-label="Edit"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDeleteTarget(a)} title="Delete" aria-label="Delete"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // One dense table row.
  const renderRow = (a: Asset) => {
    const hasFile = isUsableFileUrl(a.fileUrl);
    const isImg = hasFile && /^image\//.test(a.mimeType);
    const rel = a.releaseId ? nameOf.get(a.releaseId) : null;
    const art = a.artistId ? nameOf.get(a.artistId) : null;
    const on = selected.has(a.id);
    // Collapse the lower-priority columns (xl only) while the detail panel is open —
    // must match the hideable header columns so cells and headers stay aligned.
    const hideCol = activeId ? "xl:hidden" : "";
    return (
      <tr
        key={a.id}
        data-asset-item
        aria-selected={activeId === a.id}
        onClick={() => setActiveId((p) => (p === a.id ? null : a.id))}
        className={`cursor-pointer border-b border-border transition-colors ${activeId === a.id ? "bg-white/[0.06]" : on ? "bg-white/[0.035]" : "hover:bg-white/[0.025]"}`}
      >
        <td className="w-9 px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={on} onChange={() => toggleSelect(a.id)} aria-label={`Select ${a.title}`}
            className="h-4 w-4 rounded border-gray-600 bg-black accent-white" />
        </td>
        <td className="py-2 pr-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-black/30">
              {isImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.fileUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <AssetGlyph mime={a.mimeType} className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{a.title}</span>
              {a.fileName !== a.title ? <span className="block max-w-[22rem] truncate text-[11px] text-muted-foreground">{a.fileName}</span> : null}
            </span>
          </div>
        </td>
        <td className={`hidden px-3 py-2 md:table-cell ${hideCol}`}>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAT_PILL[a.category] ?? CAT_PILL.other}`}>
            {ASSET_CATEGORY_LABELS[a.category as AssetCategory] ?? a.category}
          </span>
        </td>
        {/* Release / Artist truncate hard and show the full value on hover. */}
        <td className={`hidden truncate px-3 py-2 text-sm text-muted-foreground lg:table-cell ${hideCol}`} title={rel ?? undefined}>{rel ?? <span className="text-muted-foreground/40">—</span>}</td>
        <td className={`hidden truncate px-3 py-2 text-sm text-muted-foreground lg:table-cell ${hideCol}`} title={art ?? undefined}>{art ?? <span className="text-muted-foreground/40">—</span>}</td>
        <td className="hidden whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-muted-foreground sm:table-cell">{a.size ? formatBytes(a.size) : "—"}</td>
        <td className="hidden whitespace-nowrap px-3 py-2 text-sm tabular-nums text-muted-foreground sm:table-cell">{fmtDate(a.createdAt)}</td>
        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-0.5">
            {hasFile ? (
              <>
                <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" title="Open (preview)" aria-label="Open (preview)"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
                  <Eye className="h-3.5 w-3.5" />
                </a>
                <a href={a.downloadHref} download={a.fileName} title="Download" aria-label="Download"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
                  <Download className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <span title="No file available" aria-label="No file available" aria-disabled="true"
                className="rounded p-1.5 cursor-not-allowed text-muted-foreground/40">
                <Download className="h-3.5 w-3.5" />
              </span>
            )}
            {a.readOnly ? (
              a.parentHref ? (
                <Link href={a.parentHref} title="Manage on its record" aria-label="Manage on its record"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : null
            ) : (
              <>
                <button type="button" onClick={() => openEdit(a)} title="Edit" aria-label="Edit"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setDeleteTarget(a)} title="Delete" aria-label="Delete"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/30 hover:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Left browse rail: pick a dimension, then a folder narrows the centre pane.
  const renderRail = () => (
    <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border p-3 md:flex">
      <div className="px-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground/70">Browse by</div>
      <div className="mb-2 grid grid-cols-4 gap-0.5 rounded-lg border border-border bg-background/40 p-0.5">
        {BROWSE_OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => changeGroupBy(o.key)}
            className={`rounded-md px-1 py-1 text-[11px] font-medium transition-colors ${groupBy === o.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="scroll-themed min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        <button type="button" onClick={() => setActiveGroup(null)}
          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${activeGroup === null ? "bg-white/10" : "hover:bg-white/5"}`}>
          <span className="flex-1 truncate">All assets</span>
          <span className="tabular-nums text-[11px] text-muted-foreground">{visible.length}</span>
        </button>
        {groups.map((g) => (
          <button key={g.key} type="button" onClick={() => setActiveGroup(g.key)}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${activeGroup === g.key ? "bg-white/10 shadow-[inset_2px_0_0_#fff]" : "hover:bg-white/5"}`}>
            <span className="flex-1 truncate">{g.name}</span>
            <span className="tabular-nums text-[11px] text-muted-foreground">{g.assets.length}</span>
          </button>
        ))}
      </div>
    </aside>
  );

  // Right preview / metadata panel for the focused row.
  const renderPreview = () => {
    const a = activeAsset;
    if (!a) return null;
    const hasFile = isUsableFileUrl(a.fileUrl);
    const isImg = hasFile && /^image\//.test(a.mimeType);
    const rel = a.releaseId ? nameOf.get(a.releaseId) : null;
    const art = a.artistId ? nameOf.get(a.artistId) : null;
    const meta: [string, string][] = [
      ["Type", ASSET_CATEGORY_LABELS[a.category as AssetCategory] ?? a.category],
      ["Release", rel ?? "—"],
      ["Artist", art ?? "—"],
      ["Size", a.size ? formatBytes(a.size) : "—"],
      ["Added", fmtDate(a.createdAt)],
      ["By", a.uploader ?? (a.readOnly ? "Catalog" : "—")],
    ];
    return (
      <aside ref={detailRef} className="scroll-themed hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-5 xl:flex">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Details</span>
          <button
            type="button"
            onClick={closeDetail}
            aria-label="Close details"
            title="Close (Esc)"
            className="-mr-1 rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {(() => {
          const previewClass = "grid aspect-square place-items-center overflow-hidden rounded-xl border border-border bg-black/30";
          const inner = isImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.fileUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <AssetGlyph mime={a.mimeType} className="h-12 w-12 text-muted-foreground" />
          );
          return hasFile ? (
            <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" className={previewClass}>{inner}</a>
          ) : (
            <div className={previewClass}>{inner}</div>
          );
        })()}
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-tight">{a.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={a.fileName}>{a.fileName}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {hasFile ? (
            <>
              {/* Download saves the file (same-origin shim → presigned S3 with
                  Content-Disposition); Open previews the raw file in a new tab. */}
              <a href={a.downloadHref} download={a.fileName}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-white text-xs font-medium text-black hover:bg-gray-200">
                <Download className="h-3.5 w-3.5" /> Download
              </a>
              <a href={a.fileUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium hover:bg-white/5">
                <Eye className="h-3.5 w-3.5" /> Open
              </a>
            </>
          ) : (
            <span aria-disabled="true" title="No file available"
              className="col-span-2 inline-flex h-8 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground/50">
              No file available
            </span>
          )}
          {a.readOnly ? (
            a.parentHref ? (
              <Link href={a.parentHref} className="col-span-2 inline-flex h-8 items-center justify-center rounded-md border border-border text-xs hover:bg-white/5">Manage on record</Link>
            ) : null
          ) : (
            <>
              <button type="button" onClick={() => openEdit(a)} className="inline-flex h-8 items-center justify-center rounded-md border border-border text-xs hover:bg-white/5">Edit details</button>
              <button type="button" onClick={() => setDeleteTarget(a)} className="inline-flex h-8 items-center justify-center rounded-md border border-border text-xs text-red-400 hover:bg-red-950/20">Delete</button>
            </>
          )}
        </div>
        <div className="overflow-hidden rounded-lg border border-border text-xs">
          {meta.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
              <span className="text-muted-foreground">{k}</span>
              <span className="truncate text-right">{v}</span>
            </div>
          ))}
        </div>
        {a.notes ? <div className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background/40 px-3 py-2 text-xs text-muted-foreground">{a.notes}</div> : null}
      </aside>
    );
  };

  return (
    // Keep the file-manager panel full-height, but drop the horizontal breakout
    // so it sits inside the admin content padding like every other page (was
    // -mx-4/-mx-8, which pushed the card flush to the screen edges).
    <div className="flex h-[calc(100dvh-6rem)] flex-col -mb-6 md:-mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…"
            className={`${inputCls} w-full pl-9`} />
        </div>
        {/* On phones the 8-way filter can't fit — let it scroll inside its own
            track instead of stretching the whole toolbar past the screen edge. */}
        <div className="-mx-1 w-full overflow-x-auto px-1 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
          <Segmented
            ariaLabel="Filter assets by category"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] ?? 0 }))}
          />
        </div>
        <span className="hidden flex-1 sm:block" />
        <Button onClick={openUpload} className="h-9 gap-1.5 bg-white text-black hover:bg-gray-200">
          <Upload className="h-4 w-4" /> Upload
        </Button>
        {activeReleaseGroup ? (
          <AssetActions
            zipHref={`/api/releases/${activeReleaseGroup.entityId}/assets/download`}
            items={buildDownloadItems(activeReleaseGroup, filter === "all" && activeReleaseGroup.entityId ? releaseLyrics[activeReleaseGroup.entityId] : undefined, ASSET_CATEGORY_LABELS)}
          />
        ) : null}
        <div className="inline-flex overflow-hidden rounded-lg border border-border">
          {(["table", "grid"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-label={v === "table" ? "List view" : "Grid view"}
              className={`grid h-8 w-9 place-items-center transition-colors ${view === v ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {v === "table" ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {renderRail()}
        <main className="flex min-w-0 flex-1 flex-col">
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white/[0.04] px-4 py-2.5 text-sm">
              <span className="font-semibold tabular-nums">{selected.size} selected</span>
              <button type="button" onClick={bulkDownload} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-white/5"><Download className="h-3.5 w-3.5" /> Download</button>
              <button type="button" onClick={() => setReassignOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-white/5"><FolderInput className="h-3.5 w-3.5" /> Reassign</button>
              <span className="flex-1" />
              <button type="button" onClick={bulkDelete} disabled={working} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-red-400 hover:bg-red-950/20 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : null}
          <div className="scroll-themed min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {assets.length === 0 ? "No assets yet. Upload masters, artwork, stems or press photos." : "No assets match."}
              </div>
            ) : view === "grid" ? (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map(renderCard)}
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-[1] bg-card">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="w-9 px-3 py-2">
                      <input type="checkbox" checked={allRowsSelected} onChange={toggleSelectAll} aria-label="Select all"
                        className="h-4 w-4 rounded border-gray-600 bg-black accent-white" />
                    </th>
                    {/* Progressive columns: on phones only Name (+ actions) show; size/date
                        appear at sm, Type at md, Release/Artist at lg. Artist is deliberately
                        narrow. `hideable` columns also collapse (xl only) while the detail
                        panel is open, so the narrower table stays readable. */}
                    {([["name", "Name", "w-[30%]", false, ""], ["type", "Type", "w-[12%]", true, "hidden md:table-cell"], ["release", "Release", "w-[16%]", true, "hidden lg:table-cell"], ["artist", "Artist", "w-[11%]", true, "hidden lg:table-cell"], ["size", "Size", "w-[9%]", false, "hidden sm:table-cell"], ["date", "Added", "w-[12%]", false, "hidden sm:table-cell"]] as const).map(([col, label, w, hideable, resp]) => (
                      <th key={col} className={`px-3 py-2 font-medium ${w} ${resp} ${col === "size" ? "text-right" : ""} ${hideable && activeId ? "xl:hidden" : ""}`}>
                        <button type="button" onClick={() => sortByCol(col)} className="inline-flex items-center gap-1 hover:text-foreground">
                          {label}{sortBy === col ? <span className="text-foreground">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                        </button>
                      </th>
                    ))}
                    {/* Fixed width so the 3–4 action icons always fit and never overlap the date. */}
                    <th className="w-36 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>{rows.map(renderRow)}</tbody>
              </table>
            )}
          </div>
        </main>
        {renderPreview()}
      </div>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!uploading) setUploadOpen(o); }}>
        <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Upload assets</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Category</label>
                <select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as AssetCategory)} disabled={uploading} className={inputCls}>
                  {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Release (optional)</label>
                <select value={uploadReleaseId} onChange={(e) => setUploadReleaseId(e.target.value)} disabled={uploading} className={inputCls}>
                  <option value="">— None —</option>
                  {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Artist (optional)</label>
                <select value={uploadArtistId} onChange={(e) => setUploadArtistId(e.target.value)} disabled={uploading} className={inputCls}>
                  <option value="">— None —</option>
                  {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              <label className="text-sm font-medium">Files</label>
              <input type="file" multiple accept={ASSET_ACCEPT} disabled={uploading} onChange={(e) => pickFiles(e.target.files)}
                className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-white/20" />
              <p className="text-xs text-muted-foreground">Audio, images, PDF, zip or video. Up to 1&nbsp;GB each. Set each asset&rsquo;s name below before uploading.</p>
            </div>
            {files.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                {files.map((f, i) => {
                  const r = prog[i] ?? { status: "queued", pct: 0 };
                  return (
                    <div key={i} className="rounded-lg border border-border bg-background/40 p-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={titles[i] ?? f.name}
                          onChange={(e) => setTitles((t) => t.map((x, idx) => (idx === i ? e.target.value : x)))}
                          disabled={uploading || r.status === "done"}
                          aria-label={`Asset name for ${f.name}`}
                          placeholder={f.name}
                          className={`${inputCls} h-8 min-w-0 flex-1 !py-1 text-xs disabled:opacity-60`}
                        />
                        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                          {r.status === "done" ? "Done" : r.status === "error" ? "Failed" : r.status === "uploading" ? `${r.pct}%` : formatBytes(f.size)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground" title={f.name}>{f.name}</p>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full transition-all ${r.status === "error" ? "bg-red-500" : r.status === "done" ? "bg-emerald-500" : "bg-white"}`}
                          style={{ width: `${r.status === "done" ? 100 : r.pct}%` }}
                        />
                      </div>
                      {r.error ? <p className="mt-1 text-[11px] text-red-400">{r.error}</p> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>
              {prog.some((r) => r.status === "done") ? "Close" : "Cancel"}
            </Button>
            <Button onClick={startUpload} disabled={uploading || pendingCount === 0} className="bg-white text-black hover:bg-gray-200">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {hasUploadErrors ? "Retry failed" : `Upload ${pendingCount || ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit metadata */}
      <Dialog open={editorOpen} onOpenChange={(o) => { if (!saving) setEditorOpen(o); }}>
        <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>Edit asset</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Category</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AssetCategory }))} className={inputCls}>
                  {ASSET_CATEGORIES.map((c) => <option key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5" />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Release (optional)</label>
                <select value={form.releaseId} onChange={(e) => setForm((f) => ({ ...f, releaseId: e.target.value }))} className={inputCls}>
                  <option value="">— None —</option>
                  {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Artist (optional)</label>
                <select value={form.artistId} onChange={(e) => setForm((f) => ({ ...f, artistId: e.target.value }))} className={inputCls}>
                  <option value="">— None —</option>
                  {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title.trim()} className="bg-white text-black hover:bg-gray-200">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!working && !o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete asset</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete “{deleteTarget?.title}” and remove the file from storage? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={working}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk reassign */}
      <Dialog open={reassignOpen} onOpenChange={(o) => { if (!working) setReassignOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reassign {selected.size} file{selected.size === 1 ? "" : "s"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Move the selected uploads to a release and/or artist. Leave a field on “Keep” to not change it — read-only catalog media in the selection is skipped.</p>
          <div className="mt-2 grid gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Release</label>
              <select value={reassignRelease} onChange={(e) => setReassignRelease(e.target.value)} className={inputCls}>
                <option value="">— Keep —</option>
                <option value="__none__">— Clear (no release) —</option>
                {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Artist</label>
              <select value={reassignArtist} onChange={(e) => setReassignArtist(e.target.value)} className={inputCls}>
                <option value="">— Keep —</option>
                <option value="__none__">— Clear (no artist) —</option>
                {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={working}>Cancel</Button>
            <Button onClick={applyReassign} disabled={working || (!reassignRelease && !reassignArtist)} className="bg-white text-black hover:bg-gray-200">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
