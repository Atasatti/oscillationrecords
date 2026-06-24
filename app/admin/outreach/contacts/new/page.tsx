"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/local-ui/Toast";

const TYPES = ["blog", "curator", "radio", "sync", "influencer"] as const;

export default function NewContactPage() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: "",
    outlet: "",
    type: "blog",
    contactEmail: "",
    contactUrl: "",
    genreFocus: "",
    notes: "",
  });

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const save = async () => {
    if (!form.name.trim() || !form.outlet.trim()) {
      toast.error("Name and outlet are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          genreFocus: form.genreFocus.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success("Contact added");
      router.push("/admin/outreach/contacts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="New contact"
        description="Add a PR contact to your outreach database."
        actions={
          <Button asChild variant="ghost">
            <Link href="/admin/outreach/contacts">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="max-w-xl space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Jake Williams"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Outlet <span className="text-destructive">*</span></label>
            <input
              value={form.outlet}
              onChange={(e) => set("outlet", e.target.value)}
              placeholder="e.g. Clash Magazine"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Type</label>
          <select
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Contact email</label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="editor@outlet.com"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Submission URL</label>
            <input
              type="url"
              value={form.contactUrl}
              onChange={(e) => set("contactUrl", e.target.value)}
              placeholder="https://…"
              className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Genre focus</label>
          <input
            value={form.genreFocus}
            onChange={(e) => set("genreFocus", e.target.value)}
            placeholder="e.g. Electronic, House, Techno (comma-separated)"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="Any useful context — response times, preferences, etc."
            className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save contact
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/outreach/contacts">Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
