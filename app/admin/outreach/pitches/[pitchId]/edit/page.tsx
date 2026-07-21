"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/local-ui/Toast";

type ContactOption = { id: string; name: string; outlet: string };
type ArtistOption = { id: string; name: string };
type ReleaseOption = { id: string; name: string };

export default function EditPitchPage() {
  const { pitchId } = useParams<{ pitchId: string }>();
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
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
      fetch(`/api/outreach/pitches/${pitchId}`).then((r) => r.json()),
      fetch("/api/outreach/contacts?pageSize=200").then((r) => r.json()),
      fetch("/api/artists").then((r) => r.json()),
      fetch("/api/releases?pageSize=200").then((r) => r.json()),
    ]).then(([pitch, c, a, rel]) => {
      setForm({
        contactId: pitch.contactId ?? "",
        artistIds: pitch.artistIds ?? [],
        releaseIds: pitch.releaseIds ?? [],
        status: pitch.status ?? "not_sent",
        sentAt: pitch.sentAt ? pitch.sentAt.slice(0, 10) : "",
        followUpDueAt: pitch.followUpDueAt ? pitch.followUpDueAt.slice(0, 10) : "",
        responseNotes: pitch.responseNotes ?? "",
        notes: pitch.notes ?? "",
      });
      setContacts(c.items ?? []);
      setArtists(Array.isArray(a) ? a : (a.items ?? []));
      setReleases(Array.isArray(rel) ? rel : (rel.items ?? []));
    })
      .catch(() => toast.error("Failed to load pitch"))
      .finally(() => setLoading(false));
  }, [pitchId, toast]);

  const set = (field: string, value: unknown) => setForm((f) => ({ ...f, [field]: value }));

  const save = async () => {
    if (!form.contactId) { toast.error("Select a contact"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/outreach/pitches/${pitchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sentAt: form.sentAt || null, followUpDueAt: form.followUpDueAt || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Pitch saved");
      router.push("/admin/outreach/pitches");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Edit pitch" description="" />
        <div className="grid max-w-4xl gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Edit pitch"
        description="Update pitch details and status."
      />

      <div className="max-w-4xl space-y-6">
        {/* Contact + Status pair up on wider screens; stack on mobile. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Contact <span className="text-destructive">*</span></label>
            <select value={form.contactId} onChange={(e) => set("contactId", e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="">Select a contact…</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.outlet}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              <option value="not_sent">Not sent</option>
              <option value="sent">Sent</option>
              <option value="followed_up">Followed up</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>
          </div>
        </div>

        {/* Relations use searchable multi-selects — they collapse to just the
            chosen artists/releases, so a big catalog never floods the form. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Linked releases <span className="font-normal text-muted-foreground">(optional)</span></label>
            <MultiSelect
              options={releases.map((r) => ({ value: r.id, label: r.name }))}
              selected={form.releaseIds}
              onChange={(v) => set("releaseIds", v)}
              placeholder="Link this pitch to releases…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Linked artists <span className="font-normal text-muted-foreground">(optional)</span></label>
            <MultiSelect
              options={artists.map((a) => ({ value: a.id, label: a.name }))}
              selected={form.artistIds}
              onChange={(v) => set("artistIds", v)}
              placeholder="Link this pitch to artists…"
            />
          </div>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Response notes</label>
            <textarea value={form.responseNotes} onChange={(e) => set("responseNotes", e.target.value)} rows={4}
              placeholder="What did they say?"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Internal notes</label>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={4}
              placeholder="Anything else to remember."
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save changes
          </Button>
          <Button asChild variant="outline"><Link href="/admin/outreach/pitches">Cancel</Link></Button>
        </div>
      </div>
    </div>
  );
}
