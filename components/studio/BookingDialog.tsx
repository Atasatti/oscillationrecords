"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type BookingForm = {
  startDate: string; startTime: string; endDate: string; endTime: string;
  title: string; notes: string;
};

export default function BookingDialog({
  open, onOpenChange, mode, initial, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initial: BookingForm;
  submitting: boolean;
  onSubmit: (values: BookingForm) => void;
}) {
  const [form, setForm] = useState<BookingForm>(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const set = (k: keyof BookingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const field = "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Book the studio" : "Edit booking"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Start date
              <input type="date" value={form.startDate} onChange={set("startDate")} className={field} required />
            </label>
            <label className="text-xs text-muted-foreground">Start time
              <input type="time" value={form.startTime} onChange={set("startTime")} className={field} required />
            </label>
            <label className="text-xs text-muted-foreground">End date
              <input type="date" value={form.endDate} onChange={set("endDate")} className={field} required />
            </label>
            <label className="text-xs text-muted-foreground">End time
              <input type="time" value={form.endTime} onChange={set("endTime")} className={field} required />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">Session title (optional)
            <input type="text" value={form.title} onChange={set("title")} placeholder="e.g. Vocal tracking" className={field} maxLength={200} />
          </label>
          <label className="block text-xs text-muted-foreground">Private notes (only you &amp; the label)
            <textarea value={form.notes} onChange={set("notes")} rows={2} className={field} maxLength={2000} />
          </label>
          <p className="text-xs text-muted-foreground">Times are UK time (Europe/London).</p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : mode === "create" ? "Book" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
