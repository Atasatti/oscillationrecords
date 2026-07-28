"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import WeekGrid from "@/components/studio/WeekGrid";
import BookingDialog, { type BookingForm } from "@/components/studio/BookingDialog";
import MyBookings from "@/components/studio/MyBookings";
import { weekDays, addDaysKey } from "@/lib/studio-view";
import { formatStudioDate, studioParts } from "@/lib/studio-schedule";

export type Booking = {
  id: string; start: string; end: string;
  title: string | null; bookerName: string | null; mine: boolean; notes: string | null;
};

export default function StudioBookingClient({ viewerName }: { viewerName: string | null }) {
  // Not rendered by this minimal shell yet — Tasks 9-11 use it (grid header,
  // create-form default booker name). Referenced here so it stays part of the
  // exported signature without tripping no-unused-vars.
  void viewerName;

  const toast = useToast();
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<BookingForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  // weekDays() always returns exactly 7 entries (Monday..Sunday).
  const from = days[0]!.startUtc;
  // Wrapped in its own useMemo (keyed on `days`, which is itself memoized on
  // `anchor`) so `to` keeps a stable reference across re-renders — otherwise
  // `new Date(...)` allocates a fresh object every render, `load`'s useCallback
  // deps change every render, and the effect below refetches in a tight loop.
  const to = useMemo(() => new Date(days[6]!.startUtc.getTime() + 864e5), [days]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studio/bookings?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(data.bookings as Booking[]);
    } catch {
      toast.error("Couldn't load bookings.");
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { void load(); }, [load]);

  const shiftWeek = (delta: number) => setAnchor(new Date(anchor.getTime() + delta * 7 * 864e5));

  const openCreate = (dateKey: string, hour: number) => {
    setEditId(null);
    const startTime = `${String(hour).padStart(2, "0")}:00`;
    const endHour = (hour + 1) % 24;
    const endDate = endHour === 0 ? addDaysKey(dateKey, 1) : dateKey;
    const endTime = `${String(endHour).padStart(2, "0")}:00`;
    setDraft({ startDate: dateKey, startTime, endDate, endTime, title: "", notes: "" });
    setDialogOpen(true);
  };

  const submitCreate = async (values: BookingForm) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/studio/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't book that slot."); return; }
      toast.success("Booked.");
      setDialogOpen(false);
      await load();
    } catch {
      toast.error("Couldn't book that slot.");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (b: Booking) => {
    const s = studioParts(new Date(b.start));
    const e = studioParts(new Date(b.end));
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditId(b.id);
    setDraft({
      startDate: `${s.year}-${pad(s.month)}-${pad(s.day)}`,
      startTime: `${pad(s.hour)}:${pad(s.minute)}`,
      endDate: `${e.year}-${pad(e.month)}-${pad(e.day)}`,
      endTime: `${pad(e.hour)}:${pad(e.minute)}`,
      title: b.title ?? "",
      notes: b.notes ?? "",
    });
    setDialogOpen(true);
  };

  const submitEdit = async (values: BookingForm) => {
    if (!editId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/studio/bookings/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't update the booking."); return; }
      toast.success("Updated.");
      setDialogOpen(false);
      await load();
    } catch {
      toast.error("Couldn't update the booking.");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async (b: Booking) => {
    if (!confirm("Cancel this booking? The slot will be freed.")) return;
    try {
      const res = await fetch(`/api/studio/bookings/${b.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't cancel."); return; }
      toast.success("Cancelled.");
      await load();
    } catch {
      toast.error("Couldn't cancel.");
    }
  };

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Studio booking</h1>
          <p className="text-sm text-muted-foreground">All times shown in UK time (Europe/London).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} aria-label="Previous week" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm text-muted-foreground">{formatStudioDate(days[0]!.startUtc)} – {formatStudioDate(days[6]!.startUtc)}</span>
          <button onClick={() => shiftWeek(1)} aria-label="Next week" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <WeekGrid
          days={days}
          bookings={bookings}
          onSelectSlot={openCreate}
          onSelectBooking={(b) => { if (b.mine) openEdit(b); }}
        />
      )}

      <MyBookings bookings={bookings} onEdit={openEdit} onCancel={cancelBooking} />

      {draft ? (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={editId ? "edit" : "create"}
          initial={draft}
          submitting={submitting}
          onSubmit={editId ? submitEdit : submitCreate}
        />
      ) : null}
    </div>
  );
}
