"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Bell, CheckCircle2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

/**
 * In-app reminders bell in the admin topbar. Surfaces the tasks that need action
 * NOW — overdue or due today (not done) — with a badge count and a dropdown list,
 * so nobody has to go looking. Highlights tasks assigned to the current user.
 * Hides itself entirely for roles without task access (a 403 on load).
 */
type Task = { id: string; title: string; status: string; dueAt: string | null; assigneeId: string | null };

export default function AdminReminders() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/outreach/tasks?isTemplate=false");
      if (r.status === 403) { setDenied(true); return; }
      if (!r.ok) throw new Error();
      const j = await r.json();
      setTasks(j.items ?? []);
    } catch {
      // keep whatever we had; non-fatal
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (denied) return null;

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endToday = startToday + 24 * 60 * 60 * 1000 - 1;

  const actionable = tasks
    .filter((t) => t.status !== "done" && t.dueAt && new Date(t.dueAt).getTime() <= endToday)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  const count = actionable.length;

  return (
    <DropdownMenu onOpenChange={(o) => { if (o) load(); }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `Reminders: ${count} task${count === 1 ? "" : "s"} due or overdue` : "Reminders"}
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
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Reminders</span>
          <Link href="/admin/tasks" className="text-xs text-muted-foreground hover:text-foreground">All tasks →</Link>
        </div>

        {count === 0 ? (
          <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" /> You&apos;re all caught up.
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {actionable.map((t) => {
              const overdue = new Date(t.dueAt!).getTime() < startToday;
              const mine = !!myId && t.assigneeId === myId;
              return (
                <li key={t.id}>
                  <Link
                    href="/admin/tasks"
                    className="flex items-start gap-2 px-3 py-2 transition-colors hover:bg-accent"
                  >
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${overdue ? "bg-red-500" : "bg-amber-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{t.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {overdue ? "Overdue" : "Due today"}{mine ? " · you" : ""}
                      </span>
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
