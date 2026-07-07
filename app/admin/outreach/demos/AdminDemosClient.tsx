"use client";

import React, { useMemo, useState } from "react";
import { Star, Plus, Trash2, Pencil, Loader2, ExternalLink } from "lucide-react";
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
import Segmented from "@/components/admin/ui/Segmented";
import { DEMO_STAGES, DEMO_STAGE_LABELS, type DemoStage } from "@/lib/demo";

export type Demo = {
  id: string;
  artistName: string;
  contactName: string | null;
  contactEmail: string | null;
  link: string | null;
  genre: string | null;
  source: string | null;
  stage: string;
  rating: number;
  notes: string | null;
  createdAt: string;
};

type Form = {
  artistName: string;
  contactName: string;
  contactEmail: string;
  link: string;
  genre: string;
  source: string;
  stage: DemoStage;
  rating: number;
  notes: string;
};

const blankForm = (): Form => ({
  artistName: "", contactName: "", contactEmail: "", link: "", genre: "", source: "",
  stage: "received", rating: 0, notes: "",
});

const STAGE_PILL: Record<string, string> = {
  received: "border-zinc-600/50 bg-zinc-500/10 text-zinc-300",
  reviewing: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  offer: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  releasing: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  passed: "border-red-500/30 bg-red-500/5 text-red-300/80",
};

const inputCls = "rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Stars({ value, onSet }: { value: number; onSet?: (n: number) => void }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onSet}
          onClick={() => onSet?.(value === i ? 0 : i)}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className={onSet ? "transition-transform hover:scale-110" : "cursor-default"}
        >
          <Star className={`h-4 w-4 ${i <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
        </button>
      ))}
    </span>
  );
}

type Filter = "all" | DemoStage;

export default function AdminDemosClient({ initial }: { initial: Demo[] }) {
  const toast = useToast();
  const [demos, setDemos] = useState<Demo[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<Demo | null>(null);
  const [form, setForm] = useState<Form>(blankForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Demo | null>(null);
  const [working, setWorking] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: demos.length };
    for (const d of demos) c[d.stage] = (c[d.stage] ?? 0) + 1;
    return c;
  }, [demos]);

  const visible = useMemo(
    () => (filter === "all" ? demos : demos.filter((d) => d.stage === filter)),
    [demos, filter]
  );

  const patchDemo = async (d: Demo, patch: Partial<Pick<Demo, "stage" | "rating">>) => {
    setPending((p) => new Set(p).add(d.id));
    setDemos((list) => list.map((x) => (x.id === d.id ? { ...x, ...patch } : x)));
    try {
      const res = await fetch(`/api/outreach/demos/${d.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't update — you may not have permission.");
      // Revert only this card — a full-list snapshot would wipe other cards' edits.
      setDemos((list) => list.map((x) => (x.id === d.id ? d : x)));
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(d.id); return n; });
    }
  };

  const openNew = () => { setEditingId(null); setEditOriginal(null); setForm(blankForm()); setEditorOpen(true); };
  const openEdit = (d: Demo) => {
    setEditingId(d.id);
    setEditOriginal(d);
    setForm({
      artistName: d.artistName,
      contactName: d.contactName ?? "",
      contactEmail: d.contactEmail ?? "",
      link: d.link ?? "",
      genre: d.genre ?? "",
      source: d.source ?? "",
      stage: (DEMO_STAGES as readonly string[]).includes(d.stage) ? (d.stage as DemoStage) : "received",
      rating: d.rating,
      notes: d.notes ?? "",
    });
    setEditorOpen(true);
  };
  const setField = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (saving) return;
    if (!form.artistName.trim()) { toast.error("Artist name is required"); return; }
    // On edit, send only the fields that actually changed in the dialog. The full
    // form always carries stage/rating, so posting it whole would clobber a quick
    // stage/star edit made (by anyone) after the dialog was opened.
    let payload: Record<string, unknown> = form;
    if (editingId && editOriginal) {
      const o = editOriginal;
      const diff: Record<string, unknown> = {};
      if (form.artistName.trim() !== o.artistName) diff.artistName = form.artistName;
      if (form.contactName !== (o.contactName ?? "")) diff.contactName = form.contactName;
      if (form.contactEmail !== (o.contactEmail ?? "")) diff.contactEmail = form.contactEmail;
      if (form.link !== (o.link ?? "")) diff.link = form.link;
      if (form.genre !== (o.genre ?? "")) diff.genre = form.genre;
      if (form.source !== (o.source ?? "")) diff.source = form.source;
      if (form.stage !== o.stage) diff.stage = form.stage;
      if (form.rating !== o.rating) diff.rating = form.rating;
      if (form.notes !== (o.notes ?? "")) diff.notes = form.notes;
      if (Object.keys(diff).length === 0) { setEditorOpen(false); return; }
      payload = diff;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/outreach/demos/${editingId}` : "/api/outreach/demos";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      const saved: Demo = j.demo;
      setDemos((list) => (editingId ? list.map((x) => (x.id === editingId ? saved : x)) : [saved, ...list]));
      setEditorOpen(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save demo");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/outreach/demos/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDemos((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete demo");
    } finally {
      setWorking(false);
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    ...DEMO_STAGES.map((s) => ({ key: s, label: DEMO_STAGE_LABELS[s] })),
  ];

  return (
    <div>
      <PageHeader
        title="A&R — demos"
        description="Inbound demos and prospects through the signing funnel. Log one, rate it, and move it along."
        actions={
          <Button onClick={openNew} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> Log demo
          </Button>
        }
      />

      <div className="mb-4">
        <Segmented
          ariaLabel="Filter demos by stage"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ key: f.key, label: f.label, count: counts[f.key] ?? 0 }))}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {demos.length === 0 ? "No demos yet. Log one to start the funnel." : "No demos in this stage."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((d) => {
            const busy = pending.has(d.id);
            return (
              <div key={d.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.artistName}</span>
                      {d.genre ? <span className="text-xs text-muted-foreground">· {d.genre}</span> : null}
                      <Stars value={d.rating} onSet={(n) => patchDemo(d, { rating: n })} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {d.contactName || d.contactEmail ? (
                        <span>{d.contactName || d.contactEmail}</span>
                      ) : null}
                      {d.link ? (
                        <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">
                          Listen <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {d.source ? <span>via {d.source}</span> : null}
                    </div>
                    {d.notes ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-300">{d.notes}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                    <select
                      value={d.stage}
                      disabled={busy}
                      onChange={(e) => patchDemo(d, { stage: e.target.value as DemoStage })}
                      aria-label="Stage"
                      className={`rounded-md border py-1 pl-2.5 pr-6 text-xs font-medium focus:outline-none focus-visible:ring-1 focus-visible:ring-ring ${STAGE_PILL[d.stage] ?? "border-border bg-background text-foreground"}`}
                    >
                      {DEMO_STAGES.map((s) => (
                        <option key={s} value={s} className="bg-card text-foreground">{DEMO_STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => openEdit(d)} title="Edit demo" aria-label="Edit demo"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(d)} title="Delete demo" aria-label="Delete demo"
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
            <DialogTitle>{editingId ? "Edit demo" : "Log demo"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Artist / act <span className="text-destructive">*</span></label>
                <input value={form.artistName} onChange={(e) => setField("artistName", e.target.value)} placeholder="Who sent it in" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Contact name</label>
                <input value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Contact email</label>
                <input value={form.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Link</label>
                <input value={form.link} onChange={(e) => setField("link", e.target.value)} placeholder="SoundCloud / private stream / Drive" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Genre</label>
                <input value={form.genre} onChange={(e) => setField("genre", e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Source</label>
                <input value={form.source} onChange={(e) => setField("source", e.target.value)} placeholder="Email, SoundCloud, referral…" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Stage</label>
                <select value={form.stage} onChange={(e) => setField("stage", e.target.value as DemoStage)} className={inputCls}>
                  {DEMO_STAGES.map((s) => <option key={s} value={s}>{DEMO_STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Rating</label>
                <div className="py-1.5"><Stars value={form.rating} onSet={(n) => setField("rating", n)} /></div>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={3} placeholder="What stands out, next steps…" className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.artistName.trim()} className="bg-white text-black hover:bg-gray-200">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Log demo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!working && !o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete demo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete the demo from “{deleteTarget?.artistName}”? This cannot be undone.</p>
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
