"use client";

import React, { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Loader2, Send, CalendarClock, Eye } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import ScheduleDateTimePicker from "@/components/admin/ScheduleDateTimePicker";
import {
  CAMPAIGN_STATUS_LABELS, renderNewsletterBody, type CampaignStatus,
} from "@/lib/newsletter";

export type Campaign = {
  id: string;
  subject: string;
  body: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  opens: number;
};

const STATUS_PILL: Record<string, string> = {
  draft: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
  scheduled: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  sending: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  sent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/40 bg-red-500/10 text-red-300",
};

const inputCls =
  "rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const EDITABLE = new Set(["draft", "scheduled", "failed"]);
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function NewsletterClient({
  initial, subscriberCount, emailConfigured,
}: {
  initial: Campaign[];
  subscriberCount: number;
  emailConfigured: boolean;
}) {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initial);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: "", body: "" });
  const [saving, setSaving] = useState(false);

  const [scheduleTarget, setScheduleTarget] = useState<Campaign | null>(null);
  const [scheduleValue, setScheduleValue] = useState("");
  const [sendTarget, setSendTarget] = useState<Campaign | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [working, setWorking] = useState(false);

  const previewHtml = useMemo(() => renderNewsletterBody(form.body), [form.body]);

  const upsert = (c: Campaign) =>
    setCampaigns((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [c, ...list]));

  const openNew = () => { setEditingId(null); setForm({ subject: "", body: "" }); setEditorOpen(true); };
  const openEdit = (c: Campaign) => { setEditingId(c.id); setForm({ subject: c.subject, body: c.body }); setEditorOpen(true); };

  const save = async () => {
    if (saving) return;
    if (!form.subject.trim()) { toast.error("A subject is required"); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/newsletter/campaigns/${editingId}` : "/api/newsletter/campaigns";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: form.subject, body: form.body }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      upsert(j.campaign);
      setEditorOpen(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const openSchedule = (c: Campaign) => {
    setScheduleTarget(c);
    // Seed with the existing schedule (as local datetime-local), else blank.
    if (c.scheduledFor) {
      const d = new Date(c.scheduledFor);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setScheduleValue(local);
    } else {
      setScheduleValue("");
    }
  };

  const submitSchedule = async (clear: boolean) => {
    if (!scheduleTarget || working) return;
    if (!clear && !scheduleValue) { toast.error("Pick a date and time"); return; }
    setWorking(true);
    try {
      const scheduledFor = clear ? null : new Date(scheduleValue).toISOString();
      const res = await fetch(`/api/newsletter/campaigns/${scheduleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      upsert(j.campaign);
      setScheduleTarget(null);
      toast.success(clear ? "Schedule cleared" : "Scheduled");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to schedule");
    } finally {
      setWorking(false);
    }
  };

  const confirmSend = async () => {
    if (!sendTarget || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/newsletter/campaigns/${sendTarget.id}/send`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error);
      // Reflect the sent state.
      upsert({
        ...sendTarget,
        status: j.status ?? "sent",
        sentAt: new Date().toISOString(),
        recipientCount: j.recipientCount ?? sendTarget.recipientCount,
        sentCount: j.sentCount ?? 0,
        failedCount: j.failedCount ?? 0,
      });
      setSendTarget(null);
      toast.success(`Sent to ${j.sentCount ?? 0} subscriber${(j.sentCount ?? 0) === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Failed to send");
    } finally {
      setWorking(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || working) return;
    setWorking(true);
    try {
      const res = await fetch(`/api/newsletter/campaigns/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setCampaigns((list) => list.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Newsletter"
        description={`Compose and send to your ${subscriberCount} subscriber${subscriberCount === 1 ? "" : "s"}.`}
        actions={
          <Button onClick={openNew} className="bg-white text-black hover:bg-gray-200">
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        }
      />

      {!emailConfigured ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200/90">
          Email sending isn&apos;t configured yet. You can compose, preview and schedule campaigns now — sending unlocks
          once an email provider is added: <span className="font-mono text-xs">SENDGRID_API_KEY</span> or{" "}
          <span className="font-mono text-xs">RESEND_API_KEY</span>, plus{" "}
          <span className="font-mono text-xs">EMAIL_FROM</span> (a sender verified with that provider). Scheduled
          campaigns will go out automatically once it is.
        </div>
      ) : null}

      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          No campaigns yet. Draft your first newsletter.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {campaigns.map((c) => {
            const editable = EDITABLE.has(c.status);
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.subject}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_PILL[c.status] ?? STATUS_PILL.draft}`}>
                        {CAMPAIGN_STATUS_LABELS[c.status as CampaignStatus] ?? c.status}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.status === "scheduled" && c.scheduledFor ? <span>Scheduled {fmtDateTime(c.scheduledFor)}</span> : null}
                      {c.status === "sent" && c.sentAt ? <span>Sent {fmtDateTime(c.sentAt)}</span> : null}
                      {c.status === "sent" ? <span>{c.sentCount}/{c.recipientCount} delivered{c.failedCount ? ` · ${c.failedCount} failed` : ""}</span> : null}
                      {c.status === "sent" ? <span>{c.opens} open{c.opens === 1 ? "" : "s"}</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {editable ? (
                      <>
                        <button type="button" onClick={() => openEdit(c)} title="Edit" aria-label="Edit"
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => openSchedule(c)} title="Schedule" aria-label="Schedule"
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                          <CalendarClock className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setSendTarget(c)} disabled={!emailConfigured}
                          title={emailConfigured ? "Send now" : "Email not configured"} aria-label="Send now"
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-40">
                          <Send className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(c)} title="Delete" aria-label="Delete"
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-950/20 hover:text-red-400">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{c.status === "sending" ? "Sending…" : ""}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Composer */}
      <Dialog open={editorOpen} onOpenChange={(o) => { if (!saving) setEditorOpen(o); }}>
        <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle>{editingId ? "Edit campaign" : "New campaign"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Subject <span className="text-destructive">*</span></label>
                <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Body</label>
                  <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={12}
                    placeholder={"Write your update…\n\n**Bold**, *italic*, and [links](https://…) are supported. Blank lines start new paragraphs."}
                    className={`${inputCls} resize-none font-mono text-xs`} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium"><Eye className="h-3.5 w-3.5" /> Preview</label>
                  <div className="min-h-[16rem] overflow-y-auto rounded-md border border-border bg-[#141416] p-4 text-sm text-[#e7e7ea]">
                    <div className="mb-3 text-base font-semibold text-white">{form.subject || "Subject"}</div>
                    {form.body.trim()
                      ? <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                      : <p className="text-muted-foreground">Your message preview appears here.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.subject.trim()} className="bg-white text-black hover:bg-gray-200">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editingId ? "Save changes" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule */}
      <Dialog open={!!scheduleTarget} onOpenChange={(o) => { if (!working && !o) setScheduleTarget(null); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-b border-border px-6 py-4"><DialogTitle>Schedule send</DialogTitle></DialogHeader>
          {/* Scrollable body: the picker renders in-flow (never a floating native
              popup), so it fits any width and the sticky footer keeps Schedule
              reachable on a small phone. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Send date &amp; time</label>
              <ScheduleDateTimePicker value={scheduleValue} onChange={setScheduleValue} />
              <p className="text-sm text-muted-foreground">
                “{scheduleTarget?.subject}” will send automatically at this time{!emailConfigured ? " (once email is configured)" : ""}.
              </p>
            </div>
          </div>
          <DialogFooter className="items-center justify-between border-t border-border px-6 py-4 sm:justify-between">
            <div>
              {scheduleTarget?.status === "scheduled" ? (
                <Button variant="ghost" onClick={() => submitSchedule(true)} disabled={working} className="text-muted-foreground">Clear schedule</Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setScheduleTarget(null)} disabled={working}>Cancel</Button>
              <Button onClick={() => submitSchedule(false)} disabled={working || !scheduleValue} className="bg-white text-black hover:bg-gray-200">
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Schedule
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send confirm */}
      <Dialog open={!!sendTarget} onOpenChange={(o) => { if (!working && !o) setSendTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Send now</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Send “{sendTarget?.subject}” to all {subscriberCount} subscriber{subscriberCount === 1 ? "" : "s"} right now? This can&apos;t be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTarget(null)} disabled={working}>Cancel</Button>
            <Button onClick={confirmSend} disabled={working} className="bg-white text-black hover:bg-gray-200">
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!working && !o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete campaign</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete “{deleteTarget?.subject}”? This cannot be undone.</p>
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
