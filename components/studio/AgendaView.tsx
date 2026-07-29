"use client";

import { Plus } from "lucide-react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import { Button } from "@/components/ui/button";
import { type DayColumn, segmentForDay, addDaysKey } from "@/lib/studio-view";
import { studioDayStartUtc, formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

// Mobile agenda: the week as a top-to-bottom list, one section per day, each
// booking tappable (to edit, when allowed). A booking is placed under a day when
// it intersects it — the same rule the grid uses — so an overnight session shows
// on both days.
export default function AgendaView({
  days, bookings, canEdit, onSelectBooking, onBook,
}: {
  days: DayColumn[];
  bookings: Booking[];
  canEdit: (b: Booking) => boolean;
  onSelectBooking: (b: Booking) => void;
  onBook: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Button type="button" onClick={onBook} className="mb-3 w-full shrink-0">
        <Plus className="h-4 w-4" aria-hidden /> Book a session
      </Button>

      <ul className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {days.map((day) => {
          const nextStart = studioDayStartUtc(addDaysKey(day.dateKey, 1));
          const items = bookings
            .map((b) => ({ b, seg: segmentForDay(new Date(b.start), new Date(b.end), day, nextStart) }))
            .filter((x): x is { b: Booking; seg: NonNullable<typeof x.seg> } => x.seg !== null)
            .sort((a, b) => a.seg.topMin - b.seg.topMin);

          return (
            <li key={day.dateKey}>
              <h3 className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                {formatStudioDate(day.startUtc)}
                {day.isToday ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-emerald-400">Today</span> : null}
              </h3>

              {items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-sm text-muted-foreground/60">Nothing booked</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map(({ b, seg }) => {
                    const full = seg.topMin === 0 && seg.bottomMin === 1440;
                    const range = full ? "All day" : `${formatStudioTime(new Date(b.start))}–${formatStudioTime(new Date(b.end))}`;
                    const editable = canEdit(b);
                    const content = (
                      <>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${b.mine ? "bg-emerald-400" : "bg-sky-400"}`} aria-hidden />
                        <span className="shrink-0 tabular-nums font-medium">{range}</span>
                        <span className="truncate text-muted-foreground">
                          {b.title ?? (b.mine ? "Your session" : "Booked")}
                          {!b.mine && b.bookerName ? ` · ${b.bookerName}` : ""}
                        </span>
                      </>
                    );
                    const rowClass = "flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-left text-sm";
                    return editable ? (
                      <li key={b.id}>
                        <button type="button" onClick={() => onSelectBooking(b)} className={`${rowClass} transition-colors hover:bg-white/[0.06]`}>
                          {content}
                        </button>
                      </li>
                    ) : (
                      <li key={b.id} className={rowClass}>{content}</li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
