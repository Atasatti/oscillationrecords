"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
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
  CONTENT_PLATFORMS,
  CONTENT_PLATFORM_LABELS,
  CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  dayKeyUtc,
  type ContentPlatform,
  type ContentStatus,
} from "@/lib/content-post";

export type Post = {
  id: string;
  releaseId: string | null;
  title: string;
  platform: string;
  scheduledFor: string;
  status: string;
  copy: string | null;
  assetLink: string | null;
  notes: string | null;
};

export type ReleaseOption = { id: string; name: string };

// Read-only items from elsewhere in the label (release days, task due dates,
// press, newsletters, placements) surfaced on the calendar alongside posts.
export type CalEventType = "release" | "task" | "press" | "newsletter" | "placement";
export type CalEvent = { id: string; type: CalEventType; title: string; dateKey: string; href: string };

type FilterKey = "all" | "post" | CalEventType;

const TYPE_PILL: Record<string, string> = {
  post: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  release: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  task: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  press: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  newsletter: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  placement: "border-teal-500/40 bg-teal-500/10 text-teal-300",
};
const TYPE_LABELS: Record<FilterKey, string> = {
  all: "All", post: "Posts", release: "Releases", task: "Tasks", press: "Press", newsletter: "Newsletter", placement: "Placements",
};
const FILTER_KEYS: FilterKey[] = ["all", "post", "release", "task", "press", "newsletter", "placement"];

type Form = {
  title: string;
  platform: ContentPlatform;
  date: string; // YYYY-MM-DD
  status: ContentStatus;
  releaseId: string; // "" = none
  copy: string;
  assetLink: string;
  notes: string;
};

// Muted per-platform pill — colours the calendar chips and doubles as the legend
// on the filter bar, so no separate key is needed.
const PLATFORM_PILL: Record<string, string> = {
  instagram: "border-pink-500/40 bg-pink-500/10 text-pink-300",
  tiktok: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
  twitter: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  youtube: "border-red-500/40 bg-red-500/10 text-red-300",
  facebook: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  newsletter: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  other: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

const inputCls =
  "rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad2 = (n: number) => String(n).padStart(2, "0");
// "YYYY-MM-DD" from a date's LOCAL parts — the viewer's wall-clock day, used for
// the "today" marker and the default new-post date (grid + grouping stay UTC).
const localDayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const monthLabel = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function CalendarClient({
  initial,
  releases,
  events = [],
}: {
  initial: Post[];
  releases: ReleaseOption[];
  events?: CalEvent[];
}) {
  const toast = useToast();

  const [posts, setPosts] = useState<Post[]>(initial);
  // "Today" and the default new-post date follow the viewer's LOCAL day, set
  // after mount (not during render) so the UTC server render and the local
  // client render don't disagree (hydration). Grid cells + grouping stay UTC.
  const [todayKey, setTodayKey] = useState("");
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });
  useEffect(() => {
    const d = new Date();
    setTodayKey(localDayKey(d));
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, []);
  const [typeFilter, setTypeFilter] = useState<FilterKey>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<Post | null>(null);
  const [form, setForm] = useState<Form>(blankForm(todayKey));
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [working, setWorking] = useState(false);

  const releaseName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of releases) m.set(r.id, r.name);
    return m;
  }, [releases]);

  // Posts keyed by their UTC day (shown when the filter is All or Posts).
  const postsByDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    if (typeFilter !== "all" && typeFilter !== "post") return m;
    for (const p of posts) {
      const k = dayKeyUtc(p.scheduledFor);
      const arr = m.get(k);
      if (arr) arr.push(p);
      else m.set(k, [p]);
    }
    return m;
  }, [posts, typeFilter]);

  // Aggregated read-only events (releases/tasks/press/newsletter/placements),
  // keyed by day and filtered by type.
  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      if (typeFilter !== "all" && typeFilter !== e.type) continue;
      const arr = m.get(e.dateKey);
      if (arr) arr.push(e);
      else m.set(e.dateKey, [e]);
    }
    return m;
  }, [events, typeFilter]);

  // Per-type counts within the month in view (for the filter bar).
  const monthCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, post: 0, release: 0, task: 0, press: 0, newsletter: 0, placement: 0 };
    const prefix = `${view.y}-${String(view.m + 1).padStart(2, "0")}`;
    for (const p of posts) {
      if (!dayKeyUtc(p.scheduledFor).startsWith(prefix)) continue;
      c.all += 1; c.post += 1;
    }
    for (const e of events) {
      if (!e.dateKey.startsWith(prefix)) continue;
      c.all += 1; c[e.type] += 1;
    }
    return c;
  }, [posts, events, view]);

  // 6-week grid (42 cells) for the month in view, built in UTC so posts pin to
  // the intended day for every viewer. Date.UTC handles month/year rollover.
  const cells = useMemo(() => {
    const weekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay(); // 0=Sun
    const lead = (weekday + 6) % 7; // shift to Monday-first
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(Date.UTC(view.y, view.m, 1 - lead + i));
      return { key: dayKeyUtc(d), day: d.getUTCDate(), inMonth: d.getUTCMonth() === view.m };
    });
  }, [view]);

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });
  const goToday = () => {
    const d = new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const openNew = (date?: string) => {
    setEditingId(null);
    setEditOriginal(null);
    setForm(blankForm(date ?? (todayKey || localDayKey(new Date()))));
    setEditorOpen(true);
  };
  const openEdit = (p: Post) => {
    setEditingId(p.id);
    setEditOriginal(p);
    setForm({
      title: p.title,
      platform: (CONTENT_PLATFORMS as readonly string[]).includes(p.platform)
        ? (p.platform as ContentPlatform)
        : "other",
      date: dayKeyUtc(p.scheduledFor),
      status: (CONTENT_STATUSES as readonly string[]).includes(p.status)
        ? (p.status as ContentStatus)
        : "idea",
      releaseId: p.releaseId ?? "",
      copy: p.copy ?? "",
      assetLink: p.assetLink ?? "",
      notes: p.notes ?? "",
    });
    setEditorOpen(true);
  };
  const setField = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (saving) return;
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.date) { toast.error("Pick a date"); return; }
    // On edit, send only changed fields (avoids clobbering a field another admin
    // touched). On create, send the whole form.
    let payload: Record<string, unknown>;
    if (editingId && editOriginal) {
      const o = editOriginal;
      const diff: Record<string, unknown> = {};
      if (form.title.trim() !== o.title) diff.title = form.title.trim();
      if (form.platform !== o.platform) diff.platform = form.platform;
      if (form.date !== dayKeyUtc(o.scheduledFor)) diff.scheduledFor = form.date;
      if (form.status !== o.status) diff.status = form.status;
      if ((form.releaseId || null) !== o.releaseId) diff.releaseId = form.releaseId || null;
      if (form.copy !== (o.copy ?? "")) diff.copy = form.copy;
      if (form.assetLink !== (o.assetLink ?? "")) diff.assetLink = form.assetLink;
      if (form.notes !== (o.notes ?? "")) diff.notes = form.notes;
      if (Object.keys(diff).length === 0) { setEditorOpen(false); return; }
      payload = diff;
    } else {
      payload = {
        title: form.title.trim(),
        platform: form.platform,
        scheduledFor: form.date,
        status: form.status,
        releaseId: form.releaseId || null,
        copy: form.copy,
        assetLink: form.assetLink,
        notes: form.notes,
      };
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/content/posts/${editingId}` : "/api/content/posts";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      const saved: Post = j.post;
      setPosts((list) =>
        editingId ? list.map((x) => (x.id === editingId ? saved : x)) : [...list, saved]
      );
      setEditorOpen(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save post");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/content/posts/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setPosts((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete post");
    } finally {
      setWorking(false);
    }
  };

  const FILTERS = FILTER_KEYS.map((key) => ({ key, label: TYPE_LABELS[key] }));

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Everything dated across the label — posts, releases, task due dates, press, newsletters and placements. Click a day to plan a post; the rest link to where they're managed."
        actions={
          <Button onClick={() => openNew()} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> New post
          </Button>
        }
      />

      {/* Month navigation */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <h2 className="min-w-[10rem] text-lg font-semibold">{monthLabel(view.y, view.m)}</h2>
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
      </div>

      {/* Type filter — colours double as the legend for the chips */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {FILTERS.map(({ key, label }) => {
          const active = typeFilter === key;
          const pill = key === "all" ? "" : TYPE_PILL[key] ?? "";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? key === "all"
                    ? "border-white/30 bg-white/10 text-foreground"
                    : pill
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 tabular-nums opacity-70">{monthCounts[key] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* Calendar grid */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-white/[0.02]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const dayPosts = postsByDay.get(cell.key) ?? [];
            const dayEvents = eventsByDay.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            return (
              <div
                key={cell.key}
                onClick={() => openNew(cell.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") openNew(cell.key); }}
                aria-label={`Add post on ${cell.key}`}
                className={`min-h-[6.5rem] cursor-pointer border-border p-1.5 transition-colors hover:bg-white/[0.03] ${
                  i % 7 !== 6 ? "border-r" : ""
                } ${i < 35 ? "border-b" : ""} ${cell.inMonth ? "" : "bg-black/20"}`}
              >
                <div className="mb-1 flex justify-end">
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
                      isToday
                        ? "bg-white font-semibold text-black"
                        : cell.inMonth
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {cell.day}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {dayPosts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEdit(p); }}
                      title={`${p.title} — ${CONTENT_STATUS_LABELS[p.status as ContentStatus] ?? p.status}`}
                      className={`w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] transition-opacity hover:opacity-80 ${
                        PLATFORM_PILL[p.platform] ?? PLATFORM_PILL.other
                      } ${p.status === "published" ? "line-through opacity-60" : ""}`}
                    >
                      {p.title}
                    </button>
                  ))}
                  {dayEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      href={ev.href}
                      onClick={(e) => e.stopPropagation()}
                      title={`${ev.title} · ${TYPE_LABELS[ev.type]}`}
                      className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] transition-opacity hover:opacity-80 ${TYPE_PILL[ev.type] ?? ""}`}
                    >
                      {ev.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Click a day to plan a post (or a post to edit it). Releases, tasks, press, newsletters and placements are shown from their own pages — click to open. Published posts show struck-through.
      </p>

      {/* Editor */}
      <Dialog open={editorOpen} onOpenChange={(o) => { if (!saving) setEditorOpen(o); }}>
        <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{editingId ? "Edit post" : "New post"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Title / hook <span className="text-destructive">*</span></label>
                <input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="What's the post about" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Platform</label>
                <select value={form.platform} onChange={(e) => setField("platform", e.target.value as ContentPlatform)} className={inputCls}>
                  {CONTENT_PLATFORMS.map((p) => <option key={p} value={p}>{CONTENT_PLATFORM_LABELS[p]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Date <span className="text-destructive">*</span></label>
                <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Status</label>
                <select value={form.status} onChange={(e) => setField("status", e.target.value as ContentStatus)} className={inputCls}>
                  {CONTENT_STATUSES.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Release (optional)</label>
                <select value={form.releaseId} onChange={(e) => setField("releaseId", e.target.value)} className={inputCls}>
                  <option value="">— None —</option>
                  {releases.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Copy / caption</label>
                <textarea value={form.copy} onChange={(e) => setField("copy", e.target.value)} rows={3} placeholder="Draft the caption…" className={`${inputCls} resize-none`} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Asset link</label>
                <input value={form.assetLink} onChange={(e) => setField("assetLink", e.target.value)} placeholder="Link to the image / video / Drive folder" className={inputCls} />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <textarea value={form.notes} onChange={(e) => setField("notes", e.target.value)} rows={2} className={`${inputCls} resize-none`} />
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
              <Button onClick={save} disabled={saving || !form.title.trim()} className="bg-white text-black hover:bg-gray-200">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Add post"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!working && !o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete post</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete “{deleteTarget?.title}”{deleteTarget?.releaseId && releaseName.get(deleteTarget.releaseId) ? ` (${releaseName.get(deleteTarget.releaseId)})` : ""}? This cannot be undone.
          </p>
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

function blankForm(date: string): Form {
  return {
    title: "", platform: "instagram", date, status: "idea",
    releaseId: "", copy: "", assetLink: "", notes: "",
  };
}
