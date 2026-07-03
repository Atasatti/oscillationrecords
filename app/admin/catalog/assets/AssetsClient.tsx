"use client";

import React, { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Upload, Trash2, Pencil, Loader2, Download, Music, FileText, FileArchive, Film, File as FileIcon,
  Image as ImageIcon,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import {
  ASSET_CATEGORIES, ASSET_CATEGORY_LABELS, ASSET_ACCEPT, formatBytes, type AssetCategory,
} from "@/lib/asset";

export type Asset = {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
  releaseId: string | null;
  artistId: string | null;
  notes: string | null;
  createdAt: string;
  uploader: string | null;
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
  initial, releases, artists,
}: {
  initial: Asset[];
  releases: Option[];
  artists: Option[];
}) {
  const toast = useToast();
  const { data: session } = useSession();
  const myName = session?.user?.name || session?.user?.email || null;
  const [assets, setAssets] = useState<Asset[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [prog, setProg] = useState<UploadRow[]>([]);
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

  const setRow = (i: number, patch: Partial<UploadRow>) =>
    setProg((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const pickFiles = (list: FileList | null) => {
    const fs = Array.from(list ?? []);
    setFiles(fs);
    setProg(fs.map(() => ({ status: "queued" as const, pct: 0 })));
  };

  const openUpload = () => {
    setFiles([]); setProg([]); setUploadReleaseId(""); setUploadArtistId(""); setUploadOpen(true);
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
            fileKey, fileName: file.name, title: file.name, category: uploadCategory,
            releaseId: uploadReleaseId || null, artistId: uploadArtistId || null,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "Couldn't save");
        }
        const { asset } = await res.json();
        created.push({ ...asset, uploader: myName });
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

  return (
    <div>
      <PageHeader
        title="Asset library"
        description="Masters, artwork, stems, press photos and EPKs — one place, linked to releases and artists."
        actions={
          <Button onClick={openUpload} className="bg-white text-black hover:bg-gray-200">
            <Upload className="h-4 w-4" /> Upload
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap items-center rounded-lg border border-border p-0.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                filter === key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets…"
          className={`${inputCls} w-full sm:w-64`}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {assets.length === 0 ? "No assets yet. Upload masters, artwork, stems or press photos." : "No assets match."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((a) => {
            const rel = a.releaseId ? nameOf.get(a.releaseId) : null;
            const art = a.artistId ? nameOf.get(a.artistId) : null;
            const isImg = /^image\//.test(a.mimeType);
            return (
              <div key={a.id} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
                <a
                  href={a.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-32 items-center justify-center overflow-hidden border-b border-border bg-black/20"
                >
                  {isImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.fileUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AssetGlyph mime={a.mimeType} className="h-10 w-10 text-muted-foreground" />
                  )}
                </a>
                <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CAT_PILL[a.category] ?? CAT_PILL.other}`}>
                      {ASSET_CATEGORY_LABELS[a.category as AssetCategory] ?? a.category}
                    </span>
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{formatBytes(a.size)}</span>
                  </div>
                  <p className="truncate text-sm font-medium" title={a.title}>{a.title}</p>
                  {a.fileName !== a.title ? <p className="truncate text-xs text-muted-foreground" title={a.fileName}>{a.fileName}</p> : null}
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    {rel ? <span>Release: {rel}</span> : null}
                    {art ? <span>Artist: {art}</span> : null}
                  </div>
                  {a.notes ? <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs text-gray-400">{a.notes}</p> : null}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span className="truncate text-[11px] text-muted-foreground">
                      {fmtDate(a.createdAt)}{a.uploader ? ` · ${a.uploader}` : ""}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <a href={a.fileUrl} target="_blank" rel="noopener noreferrer" download={a.fileName} title="Download" aria-label="Download"
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button type="button" onClick={() => openEdit(a)} title="Edit" aria-label="Edit"
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(a)} title="Delete" aria-label="Delete"
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
              <p className="text-xs text-muted-foreground">Audio, images, PDF, zip or video. Up to 1&nbsp;GB each.</p>
            </div>
            {files.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                {files.map((f, i) => {
                  const r = prog[i] ?? { status: "queued", pct: 0 };
                  return (
                    <div key={i} className="rounded-lg border border-border bg-background/40 p-2.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate">{f.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {r.status === "done" ? "Done" : r.status === "error" ? "Failed" : r.status === "uploading" ? `${r.pct}%` : formatBytes(f.size)}
                        </span>
                      </div>
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
    </div>
  );
}
