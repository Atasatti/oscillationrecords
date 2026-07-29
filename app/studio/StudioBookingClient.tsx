"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import WeekGrid from "@/components/studio/WeekGrid";
import DayView from "@/components/studio/DayView";
import AgendaView from "@/components/studio/AgendaView";
import BookingDialog, { type BookingForm } from "@/components/studio/BookingDialog";
import MyBookings from "@/components/studio/MyBookings";
import { weekDays, addDaysKey } from "@/lib/studio-view";
import { formatStudioDate, studioDayStartUtc, studioParts } from "@/lib/studio-schedule";

export type Booking = {
  id: string; start: string; end: string;
  title: string | null; bookerName: string | null; mine: boolean; notes: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const keyOfNow = () => {
  const p = studioParts(new Date());
  return { key: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour };
};

export default function StudioBookingClient({ viewerName, isOwner }: { viewerName: string | null; isOwner: boolean }) {
  // Reserved for later (greeting / prefilled booker). Kept on the signature.
  void viewerName;

  const toast = useToast();
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<BookingForm | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"agenda" | "day">("agenda");
  const [selectedDayKey, setSelectedDayKey] = useState<string>("");

  const days = useMemo(() => weekDays(anchor), [anchor]);
  // weekDays() always returns exactly 7 entries (Monday..Sunday).
  const from = days[0]!.startUtc;
  // DST-correct week end: the UTC instant of the day AFTER Sunday's local midnight
  // (a fixed +24h would drift an hour on the two changeover Sundays).
  const to = useMemo(() => studioDayStartUtc(addDaysKey(days[6]!.dateKey, 1)), [days]);

  // After mount, default the mobile day view to today (avoids using `now` during
  // SSR, which would risk a hydration mismatch on the active day chip).
  useEffect(() => { setSelectedDayKey(keyOfNow().key); }, []);
  const effectiveDayKey = days.some((d) => d.dateKey === selectedDayKey) ? selectedDayKey : days[0]!.dateKey;

  // Monotonic request id: only the most recent fetch may write state, so quickly
  // paging weeks can't let a slow earlier response clobber the current one.
  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/studio/bookings?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (id === reqId.current) setBookings(data.bookings as Booking[]);
    } catch {
      if (id === reqId.current) toast.error("Couldn't load bookings.");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { void load(); }, [load]);

  const shiftWeek = (delta: number) => setAnchor((a) => new Date(a.getTime() + delta * 7 * 864e5));
  const goToday = () => setAnchor(new Date());

  const openCreate = (dateKey: string, hour: number) => {
    setEditId(null);
    const startTime = `${pad(hour)}:00`;
    const endHour = (hour + 1) % 24;
    const endDate = endHour === 0 ? addDaysKey(dateKey, 1) : dateKey;
    const endTime = `${pad(endHour)}:00`;
    setDraft({ startDate: dateKey, startTime, endDate, endTime, title: "", notes: "" });
    setDialogOpen(true);
  };

  // Generic "Book a session" (agenda button): default to today if it's in the shown
  // week, else the week's first day; the dialog's pickers let them change it.
  const openCreateDefault = () => {
    const { key, hour } = keyOfNow();
    const inWeek = days.some((d) => d.dateKey === key);
    openCreate(inWeek ? key : days[0]!.dateKey, inWeek ? Math.min(23, hour + 1) : 9);
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

  // Owner may open ANY booking to reschedule; a booker only their own.
  const canEdit = useCallback((b: Booking) => b.mine || isOwner, [isOwner]);
  const selectBooking = (b: Booking) => { if (canEdit(b)) openEdit(b); };

  // A day is "free" (all-day-bookable) when no confirmed booking in view touches
  // it. Best-effort from the loaded week; the server re-checks overlap on submit.
  const dayIsFree = useCallback((dateKey: string) => {
    const dayStart = studioDayStartUtc(dateKey).getTime();
    const dayEnd = studioDayStartUtc(addDaysKey(dateKey, 1)).getTime();
    return !bookings.some((b) => new Date(b.end).getTime() > dayStart && new Date(b.start).getTime() < dayEnd);
  }, [bookings]);

  const navBtn = "rounded-lg border border-white/10 p-2 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground";

  return (
    <div>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[length:var(--text-h2)] font-light leading-tight tracking-tighter">Studio booking</h1>
          <p className="mt-1 text-sm text-muted-foreground">Click any free slot to book. All times UK (Europe/London).</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className={navBtn}><ChevronLeft className="h-4 w-4" /></button>
          <span className="flex min-w-[172px] items-center justify-center gap-2 text-sm font-medium tabular-nums">
            {formatStudioDate(from)} – {formatStudioDate(days[6]!.startUtc)}
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
          </span>
          <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className={navBtn}><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={goToday} className="ml-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">Today</button>
        </div>
      </header>

      {!loading && bookings.length === 0 ? (
        <p className="mb-3 hidden text-sm text-muted-foreground lg:block">Nothing booked this week yet — click any time on the grid to make the first one.</p>
      ) : null}

      {/* Desktop: full week grid */}
      <div className="hidden lg:block">
        <WeekGrid days={days} bookings={bookings} canEditAny={isOwner} onSelectSlot={openCreate} onSelectBooking={selectBooking} />
      </div>

      {/* Mobile: agenda (default) with a switchable day calendar */}
      <div className="lg:hidden">
        <div className="mb-3 inline-flex rounded-lg border border-white/10 p-0.5 text-sm">
          {(["agenda", "day"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMobileView(v)}
              className={`rounded-md px-3 py-1.5 transition-colors ${mobileView === v ? "bg-white/10 text-white" : "text-muted-foreground"}`}
            >
              {v === "agenda" ? "Agenda" : "Calendar"}
            </button>
          ))}
        </div>
        {mobileView === "agenda" ? (
          <AgendaView days={days} bookings={bookings} canEdit={canEdit} onSelectBooking={selectBooking} onBook={openCreateDefault} />
        ) : (
          <DayView days={days} selectedKey={effectiveDayKey} onSelectDay={setSelectedDayKey} bookings={bookings} canEditAny={isOwner} onSelectSlot={openCreate} onSelectBooking={selectBooking} />
        )}
      </div>

      <MyBookings bookings={bookings} onEdit={openEdit} onCancel={cancelBooking} />

      {draft ? (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={editId ? "edit" : "create"}
          initial={draft}
          submitting={submitting}
          dayIsFree={dayIsFree}
          onSubmit={editId ? submitEdit : submitCreate}
        />
      ) : null}
    </div>
  );
}
