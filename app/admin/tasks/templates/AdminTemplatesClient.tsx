"use client";

import React, { useState } from "react";
import { Plus, Trash2, Loader2, Pencil, Play, ListChecks } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import { TEMPLATE_CATEGORIES, TEMPLATE_PRIORITIES, type TemplateItem } from "@/lib/task-template";

export type Template = { id: string; name: string; description: string | null; items: TemplateItem[] };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const blankRow = (): TemplateItem => ({ title: "", category: "pitching", priority: "medium" });
const selectCls =
  "rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function AdminTemplatesClient({ initial }: { initial: Template[] }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[]>(initial);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const openNew = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setItems([blankRow()]);
    setEditorOpen(true);
  };
  const openEdit = (t: Template) => {
    setEditingId(t.id);
    setName(t.name);
    setDescription(t.description ?? "");
    setItems(t.items.length ? t.items.map((i) => ({ ...i })) : [blankRow()]);
    setEditorOpen(true);
  };

  const setRow = (i: number, patch: Partial<TemplateItem>) =>
    setItems((rows) => rows.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const removeRow = (i: number) => setItems((rows) => rows.filter((_, idx) => idx !== i));

  const save = async () => {
    const cleanName = name.trim();
    const cleanItems = items.filter((it) => it.title.trim()).map((it) => ({ ...it, title: it.title.trim() }));
    if (!cleanName) { toast.error("Name the template"); return; }
    if (cleanItems.length === 0) { toast.error("Add at least one task"); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/outreach/templates/${editingId}` : "/api/outreach/templates";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, description: description.trim() || null, items: cleanItems }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      setTemplates((ts) => (editingId ? ts.map((t) => (t.id === editingId ? j.template : t)) : [j.template, ...ts]));
      setEditorOpen(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  const apply = async (t: Template) => {
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/outreach/templates/${t.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as { created?: number };
      if (!res.ok) throw new Error();
      const n = j.created ?? 0;
      toast.success(`Created ${n} task${n === 1 ? "" : "s"} — open Tasks to see them`);
    } catch {
      toast.error("Couldn't apply — you may not have permission.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const t = deleteTarget;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/outreach/templates/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setTemplates((ts) => ts.filter((x) => x.id !== t.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Couldn't delete template");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Task templates"
        description="Reusable sets of tasks — a pre-release campaign, an artist onboarding checklist — you can spawn in one click."
        actions={
          <Button onClick={openNew} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />

      {templates.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          No templates yet. Create one to spawn a whole set of tasks at once.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => {
            const busy = busyId === t.id;
            return (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" /> {t.items.length} task{t.items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    {t.description ? <p className="mt-1 text-sm text-muted-foreground">{t.description}</p> : null}
                    <p className="mt-1.5 truncate text-xs text-muted-foreground">
                      {t.items.map((i) => i.title).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button size="sm" onClick={() => apply(t)} disabled={busy} className="bg-white text-black hover:bg-gray-200">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Apply
                    </Button>
                    <button type="button" onClick={() => openEdit(t)} title="Edit template" aria-label="Edit template"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(t)} title="Delete template" aria-label="Delete template"
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
            <DialogTitle>{editingId ? "Edit template" : "New template"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                  placeholder="e.g. Pre-release campaign, Artist onboarding"
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300}
                  placeholder="What this template is for…"
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Tasks <span className="font-normal text-muted-foreground">(each becomes a task)</span></label>
                <div className="flex flex-col gap-2">
                  {items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input value={it.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder="Task title…"
                        className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                      <select value={it.category} onChange={(e) => setRow(i, { category: e.target.value })} aria-label="Category" className={selectCls}>
                        {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
                      </select>
                      <select value={it.priority} onChange={(e) => setRow(i, { priority: e.target.value })} aria-label="Priority" className={selectCls}>
                        {TEMPLATE_PRIORITIES.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
                      </select>
                      <button type="button" onClick={() => removeRow(i)} aria-label="Remove task"
                        className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setItems((r) => [...r, blankRow()])}
                  className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border/80 hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" /> Add task
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete template</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete the template “{deleteTarget?.name}”? This cannot be undone. Tasks already created from it are not affected.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={busyId === deleteTarget?.id}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busyId === deleteTarget?.id}>
              {busyId === deleteTarget?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
