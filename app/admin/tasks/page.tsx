"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus, Loader2, Trash2, ChevronDown, ChevronUp, Sparkles,
  AlertCircle, Music2, Radio, CheckCircle2, ExternalLink, Pencil, Check,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import InfoHint from "@/components/admin/InfoHint";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import type { AttentionItem } from "@/app/api/tasks/needs-attention/route";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ["pitching", "research", "admin", "social", "sync", "radio", "catalog"] as const;
const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const PRIORITY_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

const STATUSES = ["todo", "in_progress", "done"] as const;
const STATUS_LABELS: Record<string, string> = { todo: "To Do", in_progress: "In Progress", done: "Done" };
const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];
type Tab = "attention" | StatusFilter;

const ATTENTION_HELP =
  "Issues we found automatically in your live catalog — releases or settings that need fixing (e.g. missing artwork, streaming links or metadata). Click any to jump straight to it. These aren't tasks you create; they clear once fixed.";

type PriorityVariant = "muted" | "default" | "warning" | "destructive";
function priorityVariant(p: string): PriorityVariant {
  if (p === "urgent") return "destructive";
  if (p === "high") return "warning";
  if (p === "medium") return "default";
  return "muted";
}

type AttentionPriorityVariant = "destructive" | "warning" | "muted";
function attentionPriorityVariant(p: string): AttentionPriorityVariant {
  if (p === "high") return "destructive";
  if (p === "medium") return "warning";
  return "muted";
}

const SUGGESTIONS = [
  // Outreach
  { title: "Submit latest release to BBC Introducing", category: "radio", priority: "high", description: "Upload via the BBC Introducing submission portal. Include a short bio and press photo." },
  { title: "Find 10 new blog contacts in your genre", category: "research", priority: "medium", description: "Search music blogs covering your genre, find the editor's contact and add them to Contacts." },
  { title: "Follow up on pitches sent 7+ days ago", category: "pitching", priority: "high", description: "Check Outreach → Pitches for any with status 'Sent' and a follow-up date that's passed." },
  { title: "Submit to SubmitHub curators", category: "pitching", priority: "medium", description: "Upload the latest single to SubmitHub and target 10–15 playlist curators in genre." },
  { title: "Submit to Groover for blog coverage", category: "pitching", priority: "medium", description: "Use Groover to reach French and European blogs. Budget roughly €50–100 per campaign." },
  { title: "Research sync briefs this month", category: "sync", priority: "medium", description: "Check Music Gateway, Musicbed and Musicray for open sync briefs in your genre." },
  { title: "Upload catalog to a sync library", category: "sync", priority: "low", description: "Sign up to Artlist, Musicbed or Pond5 and upload released tracks for passive sync income." },
  { title: "Contact Amazing Radio for playlist add", category: "radio", priority: "medium", description: "Email Amazing Radio's music@ inbox with a short pitch and streaming link." },
  { title: "Find TikTok / Reels creators to seed", category: "social", priority: "high", description: "Identify 5–10 micro-influencers in your genre and offer them early access to the next release." },
  { title: "Build a Spotify curator shortlist for next release", category: "pitching", priority: "high", description: "Research independent playlist curators on Spotify. Aim for 20+ contacts before release day." },
  { title: "Check NTS Radio for open submissions", category: "radio", priority: "low", description: "NTS occasionally accepts guest mixes and new artist submissions — worth a monthly check." },
  { title: "Submit to Reprezent Radio", category: "radio", priority: "low", description: "UK community radio focused on emerging artists. Good for urban and electronic genres." },
  { title: "Apply for Spotify Marquee for next release", category: "pitching", priority: "high", description: "Marquee is a Spotify-direct promotional push to listeners. Apply via Spotify for Artists 7+ days before release." },
  { title: "Apply for Apple Music Essentials placement", category: "pitching", priority: "medium", description: "Contact your distributor about editorial consideration for Apple Music genre playlists." },
  // Catalog & admin
  { title: "Register all tracks with your PRO", category: "admin", priority: "high", description: "Ensure every released track is registered with PRS (UK), ASCAP, BMI or your local PRO to collect royalties." },
  { title: "Register catalog with SoundExchange", category: "admin", priority: "medium", description: "SoundExchange collects digital performance royalties for sound recordings in the US." },
  { title: "Set up YouTube Content ID", category: "admin", priority: "medium", description: "Use your distributor or a CID admin to claim ad revenue on user-uploaded versions of your tracks." },
  { title: "Add missing MusicBrainz IDs to artists", category: "catalog", priority: "medium", description: "MusicBrainz is the global open music database. Linking improves entity recognition across the web." },
  { title: "Complete ISNI registration for all artists", category: "catalog", priority: "low", description: "ISNI is the ISO standard identifier for artists — needed for rights management and metadata accuracy." },
  { title: "Update artist bios across DSPs", category: "catalog", priority: "medium", description: "Check Spotify for Artists, Apple Music for Artists and Amazon Music to ensure bios match the label site." },
  { title: "Create a press kit (EPK) for each active artist", category: "admin", priority: "medium", description: "A one-pager with bio, photo, latest release, streaming links and contact — essential for pitching." },
  { title: "Set up Bandcamp store", category: "social", priority: "low", description: "Bandcamp is great for direct-to-fan sales, name-your-price releases and superfan engagement." },
  { title: "Check streaming profiles match label branding", category: "catalog", priority: "low", description: "Ensure cover art, artist photos and bios are consistent across Spotify, Apple Music, Tidal and Amazon." },
  { title: "Submit albums to Rate Your Music / Discogs", category: "catalog", priority: "low", description: "Helps with discoverability and lets fans rate and discover your releases through music communities." },
  { title: "Post new release on relevant Reddit communities", category: "social", priority: "medium", description: "r/ThisIsOurMusic, r/Listentothis and genre-specific subreddits are good for organic reach." },
  { title: "Submit new releases to Hype Machine blogs", category: "pitching", priority: "medium", description: "Hype Machine aggregates music blogs. Getting covered by tracked blogs surfaces you on the chart." },
] as const;

type Task = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  dueAt: string | null;
  isTemplate: boolean;
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const EMPTY_FORM = { title: "", description: "", category: "pitching", priority: "medium", status: "todo", dueAt: "" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TasksPage() {
  const toast = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [showSuggestions, setShowSuggestions] = useState(false);

  // Needs attention (auto-detected catalog issues) — its own tab, eager-loaded so
  // the count is visible on the tab.
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(false);
  const [attentionLoaded, setAttentionLoaded] = useState(false);

  // Create / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // ---- data ----
  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outreach/tasks?isTemplate=false");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data.items);
    } catch {
      toast.error("Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAttention = useCallback(async () => {
    setAttentionLoading(true);
    try {
      const res = await fetch("/api/tasks/needs-attention");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAttentionItems(data.items);
      setAttentionLoaded(true);
    } catch {
      // non-fatal: the tab still works, just no count/items
    } finally {
      setAttentionLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadAttention();
  }, [loadTasks, loadAttention]);

  // ---- derived ----
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tasks.length, todo: 0, in_progress: 0, done: 0 };
    for (const t of tasks) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tasks]);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (tab === "all" || t.status === tab) &&
          (!categoryFilter || t.category === categoryFilter)
      ),
    [tasks, tab, categoryFilter]
  );

  // ---- actions ----
  const setField = (f: string, v: string) => setForm((p) => ({ ...p, [f]: v }));

  const openNew = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); };
  const openEdit = (t: Task) => {
    setEditingId(t.id);
    setForm({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt ? t.dueAt.slice(0, 10) : "",
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const body = { ...form, dueAt: form.dueAt || null, isTemplate: false };
      const res = editingId
        ? await fetch(`/api/outreach/tasks/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/outreach/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
      if (!res.ok) throw new Error();
      const wasNew = !editingId;
      toast.success(wasNew ? "Task added" : "Task updated");
      setDialogOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      // Land where the saved task is so it's visible (new tasks default to To Do).
      if (wasNew) setTab("todo");
      else if (tab !== "all" && tab !== "attention" && tab !== form.status) setTab(form.status as Tab);
      loadTasks();
    } catch {
      toast.error(editingId ? "Failed to update task" : "Failed to add task");
    } finally {
      setSaving(false);
    }
  };

  const addSuggestion = async (s: (typeof SUGGESTIONS)[number]) => {
    try {
      const res = await fetch("/api/outreach/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: s.title, description: s.description, category: s.category, priority: s.priority, isTemplate: false, status: "todo" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task added to To Do");
      setTab("todo");
      loadTasks();
    } catch {
      toast.error("Failed to add task");
    }
  };

  const updateStatus = async (id: string, status: string) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await fetch(`/api/outreach/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to update task");
      loadTasks();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/outreach/tasks/${deleteTarget}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Task deleted");
      setDeleteTarget(null);
      loadTasks();
    } catch {
      toast.error("Failed to delete task");
    } finally {
      setWorking(false);
    }
  };

  const isOverdue = (t: Task) => t.dueAt && new Date(t.dueAt) < new Date() && t.status !== "done";

  // ---- render ----
  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Outreach and label action items, plus auto-detected catalog issues."
        actions={
          <Button onClick={openNew} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> New task
          </Button>
        }
      />

      {/* Suggested tasks (collapsible) */}
      <div className="mb-5 rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowSuggestions((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Suggested tasks — click any to add to To Do
          </span>
          {showSuggestions ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showSuggestions && (
          <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                type="button"
                onClick={() => addSuggestion(s)}
                className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-border/80 hover:bg-white/[0.02]"
              >
                <span className="text-sm font-medium">{s.title}</span>
                <span className="text-xs text-muted-foreground">{s.description}</span>
                <div className="mt-1 flex gap-1.5">
                  <Badge variant="muted" className="text-[10px]">{s.category}</Badge>
                  <Badge variant={priorityVariant(s.priority)} className="text-[10px]">{PRIORITY_LABELS[s.priority]}</Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs: Needs attention + status filters, then category */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setTab("attention")}
            title={ATTENTION_HELP}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              tab === "attention" ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Needs attention
            {attentionLoaded ? (
              <span className={`ml-0.5 tabular-nums ${attentionItems.length ? "text-amber-400" : "text-muted-foreground"}`}>
                {attentionItems.length}
              </span>
            ) : attentionLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : null}
          </button>
          <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                tab === key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{counts[key] ?? 0}</span>
            </button>
          ))}
        </div>
        {tab === "attention" ? (
          <InfoHint text={ATTENTION_HELP} />
        ) : (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-border bg-card py-1.5 pl-3 pr-8 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* NEEDS ATTENTION                                                     */}
      {/* ------------------------------------------------------------------ */}
      {tab === "attention" ? (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">
            Auto-detected issues in your live catalog — click any to jump straight to it. These clear themselves once fixed.
          </p>
          {attentionLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-4">
                  <Skeleton className="mb-1.5 h-4 w-64" />
                  <Skeleton className="h-3 w-96 max-w-full" />
                </div>
              ))}
            </div>
          ) : attentionItems.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
              Everything looks good — no catalog issues found.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {attentionItems.map((item) => {
                const Icon = item.type === "release" ? Music2 : item.type === "system" ? AlertCircle : Radio;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-start gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-white/20 hover:bg-white/[0.02]"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium group-hover:underline">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={attentionPriorityVariant(item.priority)} className="text-[10px]">{item.priority}</Badge>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* -------------------------------------------------------------- */
        /* TASK LIST                                                       */
        /* -------------------------------------------------------------- */
        <div className="flex flex-col gap-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <Skeleton className="mb-1.5 h-4 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
              {tasks.length === 0
                ? "No tasks yet. Add one with “New task”, or pick from the suggestions above."
                : categoryFilter || tab !== "all"
                  ? "No tasks match these filters."
                  : "No tasks yet."}
            </div>
          ) : (
            filtered.map((t) => (
              <div
                key={t.id}
                className={`flex items-start gap-3 rounded-xl border bg-card p-4 ${isOverdue(t) ? "border-amber-500/40" : "border-border"}`}
              >
                {/* Complete toggle */}
                <button
                  type="button"
                  onClick={() => updateStatus(t.id, t.status === "done" ? "todo" : "done")}
                  title={t.status === "done" ? "Mark as to do" : "Mark as done"}
                  aria-label={t.status === "done" ? "Mark as to do" : "Mark as done"}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    t.status === "done"
                      ? "border-emerald-500 bg-emerald-500 text-black"
                      : "border-border hover:border-foreground/50"
                  }`}
                >
                  {t.status === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${t.status === "done" ? "text-muted-foreground line-through" : ""}`}>
                    {t.title}
                  </p>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="muted" className="text-[10px]">{t.category}</Badge>
                    <Badge variant={priorityVariant(t.priority)} className="text-[10px]">{PRIORITY_LABELS[t.priority]}</Badge>
                    {t.dueAt && (
                      <span className={`text-[10px] ${isOverdue(t) ? "text-amber-400" : "text-muted-foreground"}`}>
                        Due {fmtDate(t.dueAt)}{isOverdue(t) ? " ⚠" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status + edit + delete */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <select
                    value={t.status}
                    onChange={(e) => updateStatus(t.id, e.target.value)}
                    title="Change status"
                    aria-label="Change status"
                    className="rounded-md border border-border bg-background py-1 pl-2 pr-6 text-xs text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => openEdit(t)}
                    title="Edit task"
                    aria-label="Edit task"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(t.id)}
                    title="Delete task"
                    aria-label="Delete task"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setForm({ ...EMPTY_FORM }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Title <span className="text-destructive">*</span></label>
              <input value={form.title} onChange={(e) => setField("title", e.target.value)}
                placeholder="What needs to be done?"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Description</label>
              <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={2}
                placeholder="How to do it, what to look for…"
                className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Category</label>
                <select value={form.category} onChange={(e) => setField("category", e.target.value)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Priority</label>
                <select value={form.priority} onChange={(e) => setField("priority", e.target.value)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {editingId ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Status</label>
                  <select value={form.status} onChange={(e) => setField("status", e.target.value)}
                    className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Due date</label>
                <input type="date" value={form.dueAt} onChange={(e) => setField("dueAt", e.target.value)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete task</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete this task? This cannot be undone.</p>
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
