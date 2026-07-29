"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { Button } from "@/components/ui/button";
import WeekGrid from "@/components/studio/WeekGrid";
import DayView from "@/components/studio/DayView";
import AgendaView from "@/components/studio/AgendaView";
import MonthPicker from "@/components/studio/MonthPicker";
import BookingDialog, { type BookingForm } from "@/components/studio/BookingDialog";
import { weekDays, addDaysKey } from "@/lib/studio-view";
import { STUDIO_TZ, studioDayStartUtc, studioParts } from "@/lib/studio-schedule";

export type Booking = {
  id: string; start: string; end: string;
  title: string | null; bookerName: string | null; mine: boolean; notes: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const keyOfNow = () => {
  const p = studioParts(new Date());
  return { key: `${p.year}-${pad(p.month)}-${pad(p.day)}`, hour: p.hour };
};
// Compact "27 Jul" (no weekday — the day chips already carry it) for the range.
const shortDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, day: "numeric", month: "short" }).format(d);

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

  // "Book" (header button): default to the day currently in focus — the day-view's
  // selected day, else today, else the week's start (effectiveDayKey resolves that).
  const openBook = () => {
    const { key, hour } = keyOfNow();
    openCreate(effectiveDayKey, effectiveDayKey === key ? Math.min(23, hour + 1) : 12);
  };

  // Month jump, so a booking weeks/months out is reachable without paging by week.
  const monthValue = (() => { const p = studioParts(anchor); return `${p.year}-${pad(p.month)}`; })();
  const jumpToMonth = (v: string) => {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    if (m) setAnchor(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1, 12, 0, 0)));
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

  // Cancel (delete) the booking currently open in the edit dialog.
  const cancelEditing = async () => {
    if (!editId) return;
    if (!confirm("Cancel this booking? The slot will be freed.")) return;
    try {
      const res = await fetch(`/api/studio/bookings/${editId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't cancel."); return; }
      toast.success("Cancelled.");
      setDialogOpen(false);
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
    <div className="flex h-full min-h-0 flex-col">
      <header className="mb-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-light leading-tight tracking-tight sm:text-[length:var(--text-h2)] sm:tracking-tighter">Studio booking</h1>
          <Button type="button" size="sm" onClick={openBook} className="shrink-0"><Plus className="h-4 w-4" aria-hidden /> Book</Button>
        </div>
        <p className="mt-1 hidden text-sm text-muted-foreground sm:block">Click any free slot to book. All times UK (Europe/London).</p>

        <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3">
          <MonthPicker value={monthValue} onChange={jumpToMonth} />
          {/* Prev/next flank the range as one unit so they never wrap apart. */}
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shiftWeek(-1)} aria-label="Previous week" className={navBtn}><ChevronLeft className="h-4 w-4" /></button>
            <span className="flex min-w-[112px] items-center justify-center gap-1.5 text-sm font-medium tabular-nums">
              {shortDay(from)} – {shortDay(days[6]!.startUtc)}
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
            </span>
            <button type="button" onClick={() => shiftWeek(1)} aria-label="Next week" className={navBtn}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={goToday} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">Today</button>
        </div>
      </header>

      {/* Desktop: full week grid, fills the remaining height */}
      <div className="hidden min-h-0 flex-1 lg:block">
        <WeekGrid days={days} bookings={bookings} canEditAny={isOwner} onSelectSlot={openCreate} onSelectBooking={selectBooking} />
      </div>

      {/* Mobile: agenda (default) with a switchable day calendar */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="mb-3 inline-flex shrink-0 self-start rounded-lg border border-white/10 p-0.5 text-sm">
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
        <div className="min-h-0 flex-1">
          {mobileView === "agenda" ? (
            <AgendaView days={days} bookings={bookings} canEdit={canEdit} onSelectBooking={selectBooking} />
          ) : (
            <DayView days={days} selectedKey={effectiveDayKey} onSelectDay={setSelectedDayKey} bookings={bookings} canEditAny={isOwner} onSelectSlot={openCreate} onSelectBooking={selectBooking} />
          )}
        </div>
      </div>

      {draft ? (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={editId ? "edit" : "create"}
          initial={draft}
          submitting={submitting}
          dayIsFree={dayIsFree}
          onCancel={editId ? cancelEditing : undefined}
          onSubmit={editId ? submitEdit : submitCreate}
        />
      ) : null}
    </div>
  );
}
