"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, CheckCircle2, AtSign } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

/**
 * In-app reminders bell in the admin topbar. Surfaces two things:
 *  - Reminders: tasks overdue or due today (not done).
 *  - Mentions: comments that @-mention you (unread tracked per-device in
 *    localStorage — opening the bell marks them read).
 * The badge is the combined count. Hides for roles without task access (403).
 */
type Task = { id: string; title: string; status: string; dueAt: string | null; assigneeId: string | null };
type Mention = { id: string; taskId: string; taskTitle: string; authorEmail: string | null; body: string; createdAt: string };

const SEEN_KEY = "admin-mentions-seen-at";

export default function AdminReminders() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [denied, setDenied] = useState(false);
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(SEEN_KEY);
      if (v) setSeenAt(Number(v) || 0);
    } catch { /* ignore */ }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/outreach/tasks?isTemplate=false");
      if (r.status === 403) { setDenied(true); return; }
      if (!r.ok) throw new Error();
      const j = await r.json();
      setTasks(j.items ?? []);
    } catch { /* keep */ }
  }, []);

  const loadMentions = useCallback(async () => {
    try {
      const r = await fetch("/api/outreach/mentions");
      if (!r.ok) return;
      const j = await r.json();
      setMentions(j.mentions ?? []);
    } catch { /* keep */ }
  }, []);

  useEffect(() => { loadTasks(); loadMentions(); }, [loadTasks, loadMentions]);

  if (denied) return null;

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endToday = startToday + 24 * 60 * 60 * 1000 - 1;
  const actionable = tasks
    .filter((t) => t.status !== "done" && t.dueAt && new Date(t.dueAt).getTime() <= endToday)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());

  const unreadMentions = mentions.filter((m) => new Date(m.createdAt).getTime() > seenAt).length;
  const count = actionable.length + unreadMentions;

  const markSeen = () => {
    const t = Date.now();
    setSeenAt(t);
    try { window.localStorage.setItem(SEEN_KEY, String(t)); } catch { /* ignore */ }
  };

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) { loadTasks(); loadMentions(); markSeen(); } }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Notifications: ${count}` : "Notifications"}
          className="relative rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold tabular-nums text-black">
              {count > 9 ? "9+" : count}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        {/* Mentions */}
        {mentions.length > 0 ? (
          <div className="border-b border-border">
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <AtSign className="h-3.5 w-3.5" /> Mentions
            </div>
            <ul className="max-h-56 overflow-y-auto pb-1">
              {mentions.slice(0, 10).map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/tasks?task=${m.taskId}`} className="block px-3 py-2 transition-colors hover:bg-accent">
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="text-foreground">{m.authorEmail ?? "Someone"}</span> on {m.taskTitle}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-foreground">{m.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Reminders */}
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium">Due &amp; overdue</span>
          <Link href="/admin/tasks" className="text-xs text-muted-foreground hover:text-foreground">All tasks →</Link>
        </div>
        {actionable.length === 0 ? (
          <div className="flex items-center gap-2 px-3 pb-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Nothing due — you&apos;re all caught up.
          </div>
        ) : (
          <ul className="max-h-64 overflow-y-auto pb-1">
            {actionable.map((t) => {
              const overdue = new Date(t.dueAt!).getTime() < startToday;
              const mine = !!myId && t.assigneeId === myId;
              return (
                <li key={t.id}>
                  <Link href={`/admin/tasks?task=${t.id}`} className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-accent">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-red-500" : "bg-amber-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{t.title}</span>
                      <span className="text-[11px] text-muted-foreground">{overdue ? "Overdue" : "Due today"}{mine ? " · you" : ""}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
