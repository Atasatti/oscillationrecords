"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { addDaysKey } from "@/lib/studio-view";

export type BookingForm = {
  startDate: string; startTime: string; endDate: string; endTime: string;
  title: string; notes: string;
};

/** Human duration between the two wall-clock fields, computed in the browser's
 *  zone — the offset cancels out, so the minute count is the true length (bar a
 *  once-a-year DST hour, immaterial for a hint). Feedback while you pick, and a
 *  guard so an end-before-start never makes a doomed round-trip. */
function describeDuration(form: BookingForm): { ok: boolean; text: string } | null {
  const start = new Date(`${form.startDate}T${form.startTime}`);
  const end = new Date(`${form.endDate}T${form.endTime}`);
  const ms = end.getTime() - start.getTime();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { ok: false, text: "End must be after the start" };
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const length = [h ? `${h} hr` : null, m ? `${m} min` : null].filter(Boolean).join(" ") || "0 min";
  const overnight = form.endDate !== form.startDate;
  return { ok: true, text: `${length}${overnight ? " · ends next day" : ""}` };
}

export default function BookingDialog({
  open, onOpenChange, mode, initial, submitting, dayIsFree, onCancel, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initial: BookingForm;
  submitting: boolean;
  /** Whether a day (YYYY-MM-DD) has no bookings — gates the "all day" shortcut. */
  dayIsFree?: (dateKey: string) => boolean;
  /** Cancel (delete) this booking — edit mode only. */
  onCancel?: () => void;
  onSubmit: (values: BookingForm) => void;
}) {
  const [form, setForm] = useState<BookingForm>(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const set = (k: keyof BookingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Fill the whole start day: 00:00 to the next day's 00:00 (a 24h block).
  const setAllDay = () =>
    setForm((f) => ({ ...f, startTime: "00:00", endDate: addDaysKey(f.startDate, 1), endTime: "00:00" }));

  const duration = useMemo(() => describeDuration(form), [form]);
  const label = "block text-xs font-medium text-muted-foreground";
  const field =
    "mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/60 focus:outline-none focus:ring-1 focus:ring-emerald-400/30";
  // [color-scheme:dark] makes the native date/time popovers + their icons render
  // for a dark surface instead of the default light-on-dark washout.
  const dtField = `${field} [color-scheme:dark]`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Book the studio" : "Edit booking"}</DialogTitle>
          <DialogDescription>
            All times are UK (Europe/London). Overlapping slots are blocked.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
          <fieldset className="grid grid-cols-2 gap-3">
            <label className={label}>Start date
              <input type="date" value={form.startDate} onChange={set("startDate")} className={dtField} required />
            </label>
            <label className={label}>Start time
              <input type="time" value={form.startTime} onChange={set("startTime")} className={dtField} required />
            </label>
            <label className={label}>End date
              <input type="date" value={form.endDate} onChange={set("endDate")} className={dtField} required />
            </label>
            <label className={label}>End time
              <input type="time" value={form.endTime} onChange={set("endTime")} className={dtField} required />
            </label>
          </fieldset>

          <div className="flex min-h-[1.5rem] items-center justify-between gap-3">
            {duration ? (
              <p className={`text-xs ${duration.ok ? "text-emerald-400/90" : "text-rose-400"}`}>
                {duration.ok ? `Duration: ${duration.text}` : duration.text}
              </p>
            ) : <span />}
            {mode === "create" ? (() => {
              const free = dayIsFree ? dayIsFree(form.startDate) : true;
              return (
                <button
                  type="button"
                  onClick={setAllDay}
                  disabled={!free}
                  title={free ? "Book the whole day (00:00–24:00)" : "That day already has a booking"}
                  className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                >
                  Book all day
                </button>
              );
            })() : null}
          </div>

          <label className={label}>Session title <span className="text-white/30">(optional)</span>
            <input type="text" value={form.title} onChange={set("title")} placeholder="e.g. Vocal tracking" className={field} maxLength={200} />
          </label>
          <label className={label}>Private notes <span className="text-white/30">(only you &amp; the label)</span>
            <textarea value={form.notes} onChange={set("notes")} rows={2} className={`${field} resize-y`} maxLength={2000} />
          </label>

          <DialogFooter>
            {mode === "edit" && onCancel ? (
              <Button type="button" variant="outline" disabled={submitting} onClick={onCancel} className="text-rose-400 hover:text-rose-300 sm:mr-auto">
                Cancel booking
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Close</Button>
            <Button type="submit" disabled={submitting || (duration ? !duration.ok : false)}>
              {submitting ? "Saving…" : mode === "create" ? "Book session" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
