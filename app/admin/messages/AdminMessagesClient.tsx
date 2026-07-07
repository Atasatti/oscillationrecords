"use client";

import React, { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Mail, Trash2, MessageSquare, ChevronDown, ChevronUp, Send, UserPlus } from "lucide-react";
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
import Segmented from "@/components/admin/ui/Segmented";
import { unlockBody } from "@/lib/unlock-body";
import {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  STATUS_LABELS,
  PRIORITY_LABELS,
  type TicketStatus,
  type TicketPriority,
} from "@/lib/contact-ticket";
import { slaState } from "@/lib/ticket-sla";
import AddContactFromMessageDialog from "@/components/admin/AddContactFromMessageDialog";

export type StaffOption = { id: string; name: string | null; nickname: string | null; email: string };

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

// Prefer the admin-set nickname (tells similarly-named accounts apart), then the
// account name, then the email.
const staffLabel = (s: StaffOption) => s.nickname?.trim() || s.name?.trim() || s.email;

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

type Reply = { id: string; authorId: string | null; authorEmail: string | null; body: string; createdAt: string };

// Internal reply/notes thread on a ticket — a staff discussion + a log of the
// response sent. Lazily loads on expand.
function MessageReplies({ messageId, staff }: { messageId: string; staff: StaffOption[] }) {
  const toast = useToast();
  const { data: session } = useSession();
  const myEmail = session?.user?.email ?? null;
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch(`/api/contact/${messageId}/replies`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      setReplies(j.replies as Reply[]);
    } catch {
      setReplies([]);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && replies === null) load();
  };

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    try {
      const res = await fetch(`/api/contact/${messageId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      setReplies((rs) => [...(rs ?? []), j.reply as Reply]);
      setBody("");
    } catch {
      toast.error("Couldn't add the note — you may not have permission.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/contact/${messageId}/replies?replyId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setReplies((rs) => (rs ?? []).filter((x) => x.id !== id));
    } catch {
      toast.error("Couldn't delete the note");
    } finally {
      setBusyId(null);
    }
  };

  const nameFor = (email: string | null) => staff.find((s) => s.email === email)?.name?.trim() || email || "Someone";
  const count = replies?.length ?? 0;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button type="button" onClick={toggle} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <MessageSquare className="h-3.5 w-3.5" /> Notes{count ? ` (${count})` : ""}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2">
          {replies === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : replies.length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet — log your reply or leave a note for the team.</p>
          ) : (
            replies.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-background/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{nameFor(r.authorEmail)}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{fmt(r.createdAt)}</span>
                    {r.authorEmail && myEmail && r.authorEmail === myEmail ? (
                      <button type="button" onClick={() => remove(r.id)} disabled={busyId === r.id} aria-label="Delete note"
                        className="text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-50">
                        {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-300">{r.body}</p>
              </div>
            ))
          )}
          <div className="flex items-start gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Log your reply, or a note for the team…"
              className="min-w-0 flex-1 resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button size="sm" onClick={send} disabled={sending || !body.trim()} className="bg-white text-black hover:bg-gray-200">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
  // Resolved tickets are hidden from the "All" list by default; the Resolved tab
  // still shows them, and this toggle brings them back inline.
  const [showResolved, setShowResolved] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ContactMessageDTO | null>(null);
  // Message being turned into an outreach contact (opens the add-contact dialog).
  const [addContactFor, setAddContactFor] = useState<ContactMessageDTO | null>(null);
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
    // On "All", hide resolved unless the toggle is on; a specific status tab
    // (incl. Resolved) always shows exactly that status.
    const list = messages.filter((m) =>
      filter === "all" ? showResolved || m.status !== "resolved" : m.status === filter
    );
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (a.status !== "resolved" && a.priority !== b.priority)
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [messages, filter, showResolved]);

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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          ariaLabel="Filter tickets"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ key: f.key, label: f.label, count: f.count }))}
        />
        {filter === "all" && counts.resolved > 0 ? (
          <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="h-3.5 w-3.5 accent-white"
            />
            Show resolved
          </label>
        ) : null}
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
                      {(() => {
                        const sla = slaState(m.createdAt, m.status);
                        if (sla.kind === "overdue")
                          return <span className="rounded-full border border-red-500/50 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-300">{sla.label}</span>;
                        if (sla.kind === "due_soon")
                          return <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">{sla.label}</span>;
                        return null;
                      })()}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Add to contacts"
                      aria-label={`Add ${m.name || m.email} to outreach contacts`}
                      onClick={() => setAddContactFor(m)}
                    >
                      <UserPlus className="h-4 w-4" />
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

                <MessageReplies messageId={m.id} staff={staff} />
              </div>
            );
          })}
        </div>
      )}

      <AddContactFromMessageDialog
        message={addContactFor}
        open={!!addContactFor}
        onOpenChange={(o) => !o && setAddContactFor(null)}
      />

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
