"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";

/**
 * Rollup of the tasks linked to a release or artist, shown on the admin detail
 * pages (part of "relations"). Pass exactly one of releaseId / artistId. Hides
 * itself entirely if the viewer can't read tasks (e.g. a catalog-only role gets
 * a 403), so it never shows a broken panel.
 */
type LinkedTask = { id: string; title: string; status: string; dueAt: string | null };

const STATUS_LABEL: Record<string, string> = { todo: "To do", in_progress: "In progress", blocked: "Blocked", done: "Done" };
const STATUS_DOT: Record<string, string> = { todo: "bg-zinc-500", in_progress: "bg-sky-400", blocked: "bg-amber-400", done: "bg-emerald-500" };

export default function LinkedTasksPanel({ releaseId, artistId }: { releaseId?: string; artistId?: string }) {
  const [tasks, setTasks] = useState<LinkedTask[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    const key = releaseId ? `releaseId=${releaseId}` : artistId ? `artistId=${artistId}` : "";
    if (!key) return;
    let alive = true;
    fetch(`/api/outreach/tasks?isTemplate=false&${key}`)
      .then((r) => {
        if (r.status === 403) throw new Error("denied");
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then((d) => { if (alive) { setTasks(d.items ?? []); setState("ok"); } })
      .catch((e) => { if (alive) setState(e.message === "denied" ? "denied" : "ok"); });
    return () => { alive = false; };
  }, [releaseId, artistId]);

  // No access to tasks → don't render anything.
  if (state === "denied") return null;

  const done = tasks.filter((t) => t.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const kind = releaseId ? "release" : "artist";

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl font-light tracking-tighter">
          <ListChecks className="h-5 w-5 text-gray-400" /> Linked tasks
          {state === "ok" && tasks.length ? (
            <span className="text-sm text-gray-500">{done}/{tasks.length} done</span>
          ) : null}
        </h2>
        <Link href="/admin/tasks" className="text-sm text-gray-400 transition-colors hover:text-white">
          Manage in Tasks →
        </Link>
      </div>

      {state === "loading" ? (
        <div className="rounded-xl border border-gray-800 bg-[#0F0F0F] p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#0F0F0F] px-4 py-6 text-sm text-gray-500">
          No tasks linked yet. Link tasks to this {kind} from the Tasks page.
        </div>
      ) : (
        <>
          <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <ul className="divide-y divide-gray-800 overflow-hidden rounded-xl border border-gray-800 bg-[#0F0F0F]">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status] ?? "bg-zinc-500"}`} />
                <span className={`flex-1 truncate text-sm ${t.status === "done" ? "text-gray-500 line-through" : "text-gray-200"}`}>
                  {t.title}
                </span>
                <span className="shrink-0 text-xs text-gray-500">{STATUS_LABEL[t.status] ?? t.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
