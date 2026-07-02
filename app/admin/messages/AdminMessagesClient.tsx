"use client";

import React, { useMemo, useState } from "react";
import { Loader2, Mail, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import { unlockBody } from "@/lib/unlock-body";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/contact-ticket";

export type StaffOption = { id: string; name: string | null; email: string };

export type ContactMessageDTO = {
  id: string;
  name: string;
  email: string;
  message: string;
  handled: boolean;
  status: TicketStatus;
  assigneeId: string | null;
  priority: TicketPriority;
  createdAt: string;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const staffLabel = (s: StaffOption) => s.name?.trim() || s.email;

const STATUS_ORDER: Record<TicketStatus, number> = { open: 0, in_progress: 1, resolved: 2 };
const PRIORITY_ORDER: Record<TicketPriority, number> = { high: 0, medium: 1, low: 2 };

// Left accent per status.
const STATUS_ACCENT: Record<TicketStatus, string> = {
  open: "border-l-[3px] border-l-amber-500 border-border",
  in_progress: "border-l-[3px] border-l-sky-500 border-border",
  resolved: "border-border opacity-70",
};
const STATUS_PILL: Record<TicketStatus, string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  in_progress: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

const SELECT_CLASS =
  "rounded-md border border-border bg-neutral-900 px-2 py-1 text-xs text-foreground " +
  "focus:outline-none focus:ring-1 focus:ring-white/20 disabled:opacity-50";

type Filter = "all" | TicketStatus;

export default function AdminMessagesClient({
  initialMessages,
  staff,
}: {
  initialMessages: ContactMessageDTO[];
  staff: StaffOption[];
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ContactMessageDTO[]>(initialMessages);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ContactMessageDTO | null>(null);
  const [working, setWorking] = useState(false);

  const staffById = useMemo(() => {
    const m = new Map<string, StaffOption>();
    for (const s of staff) m.set(s.id, s);
    return m;
  }, [staff]);

  const counts = useMemo(() => {
    const c = { all: messages.length, open: 0, in_progress: 0, resolved: 0 };
    for (const m of messages) c[m.status] += 1;
    return c;
  }, [messages]);

  // Active tickets first (open, then in-progress), high priority first, then newest.
  const visible = useMemo(() => {
    const list = messages.filter((m) => (filter === "all" ? true : m.status === filter));
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (a.status !== "resolved" && a.priority !== b.priority)
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [messages, filter]);

  // Optimistic PATCH of any subset of ticket fields; reverts the whole row on error.
  const patchMessage = async (
    m: ContactMessageDTO,
    patch: Partial<Pick<ContactMessageDTO, "status" | "assigneeId" | "priority">>
  ) => {
    const prev = m;
    setPending((p) => new Set(p).add(m.id));
    setMessages((list) =>
      list.map((x) => {
        if (x.id !== m.id) return x;
        const next = { ...x, ...patch };
        if (patch.status) next.handled = patch.status === "resolved";
        return next;
      })
    );
    try {
      const res = await fetch(`/api/contact/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to update ticket");
      setMessages((list) => list.map((x) => (x.id === m.id ? prev : x)));
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(m.id);
        return n;
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/contact/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Message deleted");
      setMessages((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
      unlockBody();
    } catch {
      toast.error("Failed to delete message");
    } finally {
      setWorking(false);
    }
  };

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "open", label: "Open", count: counts.open },
    { key: "in_progress", label: "In progress", count: counts.in_progress },
    { key: "resolved", label: "Resolved", count: counts.resolved },
  ];

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Tickets from the public Contact form. Triage each one — set a status, priority, and owner as you work it."
      />

      <div className="mb-4 inline-flex items-center rounded-lg border border-border p-0.5">
        {FILTERS.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              filter === key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {messages.length === 0
            ? "No messages yet. Submissions from the Contact form will appear here."
            : "No tickets match this filter."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((m) => {
            const busy = pending.has(m.id);
            const assignee = m.assigneeId ? staffById.get(m.assigneeId) : null;
            return (
              <div
                key={m.id}
                className={`rounded-xl border bg-card p-4 transition-colors ${STATUS_ACCENT[m.status]}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name || "Anonymous"}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[m.status]}`}
                      >
                        {STATUS_LABELS[m.status]}
                      </span>
                      {m.priority === "high" ? <Badge variant="destructive">High priority</Badge> : null}
                      {assignee ? (
                        <span className="text-xs text-muted-foreground">→ {staffLabel(assignee)}</span>
                      ) : null}
                      <a
                        href={`mailto:${m.email}`}
                        className="truncate text-sm text-sky-300 hover:underline"
                      >
                        {m.email}
                      </a>
                      <span className="text-xs text-muted-foreground">· {fmt(m.createdAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-300">
                      {m.message}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8" title="Reply by email">
                      <a href={`mailto:${m.email}`} aria-label={`Reply to ${m.email}`}>
                        <Mail className="h-4 w-4" />
                      </a>
                    </Button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      title="Delete message"
                      aria-label="Delete message"
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Triage controls */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Status
                    <select
                      className={SELECT_CLASS}
                      value={m.status}
                      disabled={busy}
                      onChange={(e) => patchMessage(m, { status: e.target.value as TicketStatus })}
                    >
                      {TICKET_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Priority
                    <select
                      className={SELECT_CLASS}
                      value={m.priority}
                      disabled={busy}
                      onChange={(e) => patchMessage(m, { priority: e.target.value as TicketPriority })}
                    >
                      {TICKET_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Owner
                    <select
                      className={SELECT_CLASS}
                      value={m.assigneeId ?? ""}
                      disabled={busy}
                      onChange={(e) => patchMessage(m, { assigneeId: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {staffLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete message</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete the message from {deleteTarget?.name || "this sender"}? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={working}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={working}>
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
