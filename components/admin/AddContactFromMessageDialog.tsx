"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/local-ui/Toast";

type MessageLite = {
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

// Mirrors prisma OutreachContact.type ("blog" | "curator" | "radio" | "sync" | "influencer").
const CONTACT_TYPES = [
  { value: "blog", label: "Blog / Press" },
  { value: "curator", label: "Playlist curator" },
  { value: "radio", label: "Radio" },
  { value: "sync", label: "Sync" },
  { value: "influencer", label: "Influencer" },
] as const;

/**
 * Turn an inbox message into an outreach (CRM) contact. Prefills name / email /
 * notes from the message; the writer supplies the required outlet + type. POSTs to
 * the existing /api/outreach/contacts, so it slots into the outreach system as-is.
 */
export default function AddContactFromMessageDialog({
  message,
  open,
  onOpenChange,
  onAdded,
}: {
  message: MessageLite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [outlet, setOutlet] = useState("");
  const [type, setType] = useState<string>("blog");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Prefill from the message each time the dialog opens.
  useEffect(() => {
    if (open && message) {
      setName(message.name || "");
      setOutlet("");
      setType("blog");
      setEmail(message.email || "");
      const when = message.createdAt ? new Date(message.createdAt).toLocaleDateString() : "";
      setNotes(
        `From Contact-form message${when ? ` (${when})` : ""}:\n\n${message.message || ""}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!name.trim() || !outlet.trim() || !type.trim()) {
      toast.error("Name, outlet and type are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/outreach/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          outlet: outlet.trim(),
          type,
          contactEmail: email.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to add contact");
      toast.success(`Added "${name.trim()}" to contacts`);
      onAdded?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-3rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Add to contacts
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contact name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Outlet / media group *</label>
            <Input
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
              placeholder="e.g. Stereogum, BBC Introducing…"
            />
            <p className="text-xs text-muted-foreground">
              Which publication / station / company they represent.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Type *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="name@outlet.com"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-white text-black hover:bg-gray-200">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
