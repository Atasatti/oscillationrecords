"use client";

import React, { useMemo, useState } from "react";
import { Check, Loader2, Mail, RotateCcw, Trash2 } from "lucide-react";
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

export type ContactMessageDTO = {
  id: string;
  name: string;
  email: string;
  message: string;
  handled: boolean;
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

type Filter = "all" | "unread" | "handled";

export default function AdminMessagesClient({
  initialMessages,
}: {
  initialMessages: ContactMessageDTO[];
}) {
  const toast = useToast();
  const [messages, setMessages] = useState<ContactMessageDTO[]>(initialMessages);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<ContactMessageDTO | null>(null);
  const [working, setWorking] = useState(false);

  const unreadCount = useMemo(() => messages.filter((m) => !m.handled).length, [messages]);

  // Unhandled first, then newest — and apply the active filter.
  const visible = useMemo(() => {
    const list = messages.filter((m) =>
      filter === "all" ? true : filter === "unread" ? !m.handled : m.handled
    );
    return [...list].sort((a, b) => {
      if (a.handled !== b.handled) return a.handled ? 1 : -1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [messages, filter]);

  const setHandled = async (m: ContactMessageDTO, handled: boolean) => {
    setPending((p) => new Set(p).add(m.id));
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, handled } : x)));
    try {
      const res = await fetch(`/api/contact/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to update message");
      setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, handled: !handled } : x)));
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
    { key: "all", label: "All", count: messages.length },
    { key: "unread", label: "Unread", count: unreadCount },
    { key: "handled", label: "Handled", count: messages.length - unreadCount },
  ];

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Messages submitted through the public Contact form. Mark each handled once you've replied."
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
            : "No messages match this filter."}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((m) => {
            const busy = pending.has(m.id);
            return (
              <div
                key={m.id}
                className={`rounded-xl border bg-card p-4 transition-colors ${
                  m.handled ? "border-border" : "border-l-[3px] border-l-amber-500 border-border"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.name || "Anonymous"}</span>
                      {!m.handled ? <Badge variant="warning">New</Badge> : null}
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
                    {m.handled ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setHandled(m, false)}
                        title="Mark as unread"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Unread
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => setHandled(m, true)}
                        className="bg-white text-black hover:bg-gray-200"
                        title="Mark as handled"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Handled
                      </Button>
                    )}
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
