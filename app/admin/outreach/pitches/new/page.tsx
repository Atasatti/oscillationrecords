"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";

type ContactOption = { id: string; name: string; outlet: string };
type ArtistOption = { id: string; name: string };
type ReleaseOption = { id: string; name: string };

export default function NewPitchPage() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [artists, setArtists] = useState<ArtistOption[]>([]);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);

  const [form, setForm] = useState({
    contactId: "",
    artistIds: [] as string[],
    releaseIds: [] as string[],
    status: "not_sent",
    sentAt: "",
    followUpDueAt: "",
    responseNotes: "",
    notes: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/outreach/contacts?pageSize=200").then((r) => r.json()),
      fetch("/api/artists").then((r) => r.json()),
      fetch("/api/releases?pageSize=200").then((r) => r.json()),
    ]).then(([c, a, rel]) => {
      setContacts(c.items ?? []);
      setArtists(Array.isArray(a) ? a : (a.items ?? []));
      setReleases(Array.isArray(rel) ? rel : (rel.items ?? []));
    }).catch(console.error);
  }, []);

  const set = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));

  const toggleId = (field: "artistIds" | "releaseIds", id: string) => {
    setForm((f) => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });
  };

  const save = async () => {
    if (!form.contactId) { toast.error("Select a contact"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sentAt: form.sentAt || null,
          followUpDueAt: form.followUpDueAt || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Pitch logged");
      router.push("/admin/outreach/pitches");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New pitch"
        description="Log a pitch to a PR contact for one or more releases or artists."
        actions={
          <Button asChild variant="ghost">
            <Link href="/admin/outreach/pitches"><ArrowLeft className="h-4 w-4" /> Back</Link>
          </Button>
        }
      />

      <div className="max-w-xl space-y-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Contact <span className="text-destructive">*</span></label>
          <select
            value={form.contactId}
            onChange={(e) => set("contactId", e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Select a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.outlet}</option>
            ))}
          </select>
          {contacts.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No contacts yet.{" "}
              <Link href="/admin/outreach/contacts/new" className="underline hover:text-foreground">Add one first.</Link>
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Status</label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="not_sent">Not sent</option>
            <option value="sent">Sent</option>
            <option value="followed_up">Followed up</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Date sent</label>
            <input type="date" value={form.sentAt} onChange={(e) => set("sentAt", e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Follow-up due</label>
            <input type="date" value={form.followUpDueAt} onChange={(e) => set("followUpDueAt", e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
        </div>

        {artists.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Linked artists</label>
            <div className="flex flex-wrap gap-2">
              {artists.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleId("artistIds", a.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    form.artistIds.includes(a.id)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {releases.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Linked releases</label>
            <div className="flex flex-wrap gap-2">
              {releases.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggleId("releaseIds", r.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    form.releaseIds.includes(r.id)
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Response notes</label>
          <textarea value={form.responseNotes} onChange={(e) => set("responseNotes", e.target.value)} rows={2}
            placeholder="What did they say?"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Internal notes</label>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2}
            placeholder="Anything else to remember about this pitch."
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Log pitch
          </Button>
          <Button asChild variant="outline"><Link href="/admin/outreach/pitches">Cancel</Link></Button>
        </div>
      </div>
    </div>
  );
}
