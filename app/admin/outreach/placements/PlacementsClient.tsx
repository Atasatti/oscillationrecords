"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Loader2, ExternalLink } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import {
  PLACEMENT_TYPES,
  PLACEMENT_TYPE_LABELS,
  dayKeyUtc,
  type PlacementType,
} from "@/lib/placement";

export type Placement = {
  id: string;
  type: string;
  outlet: string;
  name: string | null;
  url: string | null;
  reach: number | null;
  placedOn: string | null;
  releaseId: string | null;
  artistId: string | null;
  notes: string | null;
};

export type Option = { id: string; name: string };

type Filter = "all" | PlacementType;

type Form = {
  type: PlacementType;
  outlet: string;
  name: string;
  url: string;
  reach: string;
  date: string;
  releaseId: string;
  artistId: string;
  notes: string;
};

const blankForm = (): Form => ({
  type: "playlist", outlet: "", name: "", url: "", reach: "", date: "",
  releaseId: "", artistId: "", notes: "",
});

const TYPE_PILL: Record<string, string> = {
  playlist: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  radio: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  press: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  other: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

const inputCls =
  "rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function PlacementsClient({
  initial,
  releases,
  artists,
}: {
  initial: Placement[];
  releases: Option[];
  artists: Option[];
}) {
  const toast = useToast();
  const [placements, setPlacements] = useState<Placement[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<Placement | null>(null);
  const [form, setForm] = useState<Form>(blankForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Placement | null>(null);
  const [working, setWorking] = useState(false);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of releases) m.set(r.id, r.name);
    for (const a of artists) m.set(a.id, a.name);
    return m;
  }, [releases, artists]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: placements.length };
    for (const p of placements) c[p.type] = (c[p.type] ?? 0) + 1;
    return c;
  }, [placements]);

  const visible = useMemo(
    () => (filter === "all" ? placements : placements.filter((p) => p.type === filter)),
    [placements, filter]
  );

  // Combined reach across the filtered wins — the headline pitching number.
  const totalReach = useMemo(
    () => visible.reduce((sum, p) => sum + (p.reach ?? 0), 0),
    [visible]
  );

  const openNew = () => { setEditingId(null); setEditOriginal(null); setForm(blankForm()); setEditorOpen(true); };
  const openEdit = (p: Placement) => {
    setEditingId(p.id);
    setEditOriginal(p);
    setForm({
      type: (PLACEMENT_TYPES as readonly string[]).includes(p.type) ? (p.type as PlacementType) : "other",
      outlet: p.outlet,
      name: p.name ?? "",
      url: p.url ?? "",
      reach: p.reach != null ? String(p.reach) : "",
      date: p.placedOn ? dayKeyUtc(p.placedOn) : "",
      releaseId: p.releaseId ?? "",
      artistId: p.artistId ?? "",
      notes: p.notes ?? "",
    });
    setEditorOpen(true);
  };
  const setField = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (saving) return;
    if (!form.outlet.trim()) { toast.error("Outlet is required"); return; }
    let payload: Record<string, unknown>;
    if (editingId && editOriginal) {
      const o = editOriginal;
      const diff: Record<string, unknown> = {};
      if (form.type !== o.type) diff.type = form.type;
      if (form.outlet.trim() !== o.outlet) diff.outlet = form.outlet.trim();
      if (form.name.trim() !== (o.name ?? "")) diff.name = form.name.trim();
      if (form.url !== (o.url ?? "")) diff.url = form.url;
      if (form.reach !== (o.reach != null ? String(o.reach) : "")) diff.reach = form.reach;
      if (form.date !== (o.placedOn ? dayKeyUtc(o.placedOn) : "")) diff.placedOn = form.date;
      if ((form.releaseId || null) !== o.releaseId) diff.releaseId = form.releaseId || null;
      if ((form.artistId || null) !== o.artistId) diff.artistId = form.artistId || null;
      if (form.notes !== (o.notes ?? "")) diff.notes = form.notes;
      if (Object.keys(diff).length === 0) { setEditorOpen(false); return; }
      payload = diff;
    } else {
      payload = {
        type: form.type,
        outlet: form.outlet.trim(),
        name: form.name.trim(),
        url: form.url,
        reach: form.reach,
        placedOn: form.date,
        releaseId: form.releaseId || null,
        artistId: form.artistId || null,
        notes: form.notes,
      };
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/outreach/placements/${editingId}` : "/api/outreach/placements";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      const saved: Placement = j.placement;
      setPlacements((list) => {
        const next = editingId ? list.map((x) => (x.id === editingId ? saved : x)) : [saved, ...list];
        return next.slice().sort(byDateDesc);
      });
      setEditorOpen(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save placement");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/outreach/placements/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPlacements((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete placement");
    } finally {
      setWorking(false);
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...PLACEMENT_TYPES.map((t) => ({ key: t, label: PLACEMENT_TYPE_LABELS[t] })),
  ];

  return (
    <div>
      <PageHeader
        title="Placements"
        description="Your wins — playlist adds, radio spins, and press. A running record to lean on when pitching the next release."
        actions={
          <Button onClick={openNew} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> Log placement
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
        {totalReach > 0 ? (
          <span className="text-sm text-muted-foreground">
            Combined reach <span className="font-semibold text-foreground tabular-nums">{compact.format(totalReach)}</span>
          </span>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {placements.length === 0 ? "No placements logged yet. Add your first win." : "No placements of this type."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((p) => {
            const rel = p.releaseId ? nameOf.get(p.releaseId) : null;
            const art = p.artistId ? nameOf.get(p.artistId) : null;
            return (
              <div key={p.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_PILL[p.type] ?? TYPE_PILL.other}`}>
                        {PLACEMENT_TYPE_LABELS[p.type as PlacementType] ?? p.type}
                      </span>
                      <span className="font-medium">{p.outlet}</span>
                      {p.name ? <span className="text-sm text-muted-foreground">· {p.name}</span> : null}
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {p.reach != null ? <span className="tabular-nums text-foreground/80">{compact.format(p.reach)} reach</span> : null}
                      {p.placedOn ? <span>{fmtDate(p.placedOn)}</span> : null}
                      {rel ? <span>Release: {rel}</span> : null}
                      {art ? <span>Artist: {art}</span> : null}
                    </div>
                    {p.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-300">{p.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={() => openEdit(p)} title="Edit placement" aria-label="Edit placement"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(p)} title="Delete placement" aria-label="Delete placement"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={(o) => { if (!saving) setEditorOpen(o); }}>
        <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{editingId ? "Edit placement" : "Log placement"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Type</label>
                <select value={form.type} onChange={(e) => setField("type", e.target.value as PlacementType)} className={inputCls}>
                  {PLACEMENT_TYPES.map((t) => <option key={t} value={t}>{PLACEMENT_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Date</label>
                <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Outlet <span className="text-destructive">*</span></label>
                <input value={form.outlet} onChange={(e) => setField("outlet", e.target.value)} placeholder="Spotify, BBC Radio 6 Music, Stereogum…" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Playlist / show / article</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="New Music Friday UK…" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Reach (followers / listeners)</label>
                <input type="number" min={0} value={form.reach} onChange={(e) => setField("reach", e.target.value)} placeholder="e.g. 1200000" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Link</label>
                <input value={form.url} onChange={(e) => setField("url", e.target.value)} placeholder="https://…" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Release (optional)</label>
                <select value={form.releaseId} onChange={(e) => setField("releaseId", e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Artist (optional)</label>
                <select value={form.artistId} onChange={(e) => setField("artistId", e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {artists.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} placeholder="Curator contact, how it came about…" className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>
          <DialogFooter className="items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
            <div>
              {editingId ? (
                <Button variant="ghost" onClick={() => { const t = editOriginal; setEditorOpen(false); setDeleteTarget(t); }} disabled={saving} className="text-red-400 hover:bg-red-950/20 hover:text-red-300">
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving || !form.outlet.trim()} className="bg-white text-black hover:bg-gray-200">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Log placement"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!working && !o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete placement</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete the placement at “{deleteTarget?.outlet}”? This cannot be undone.</p>
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

// Newest first: dated placements (by day) above undated, then by recency.
function byDateDesc(a: Placement, b: Placement): number {
  if (a.placedOn && b.placedOn) return a.placedOn < b.placedOn ? 1 : a.placedOn > b.placedOn ? -1 : 0;
  if (a.placedOn) return -1;
  if (b.placedOn) return 1;
  return 0;
}
