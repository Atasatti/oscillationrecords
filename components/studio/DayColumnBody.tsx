"use client";

import { Plus } from "lucide-react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import { type DayColumn, segmentForDay, addDaysKey } from "@/lib/studio-view";
import { studioDayStartUtc, formatStudioTime, minutesIntoStudioDay } from "@/lib/studio-schedule";

// Shared vertical time-grid for a single day — used by the desktop week grid (×7)
// and the mobile day view (×1). Positions are PERCENTAGES of the day (minutes /
// 1440), so the column fills whatever height its flex parent gives it and the
// whole 24h fits the viewport with no page scroll. The parent supplies the
// positioned/relative container (full height) and the ticking `now`.
export const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pct = (minutesOfDay: number) => `${(minutesOfDay / 1440) * 100}%`;

export default function DayColumnBody({
  day, bookings, canEditAny, now, onSelectSlot, onSelectBooking,
}: {
  day: DayColumn;
  bookings: Booking[];
  /** Owner: may open ANY booking to reschedule, not just their own. */
  canEditAny: boolean;
  now: Date | null;
  onSelectSlot: (dateKey: string, hour: number) => void;
  onSelectBooking: (b: Booking) => void;
}) {
  const nextStart = studioDayStartUtc(addDaysKey(day.dateKey, 1));
  return (
    <>
      {HOURS.map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onSelectSlot(day.dateKey, h)}
          className="group absolute left-0 right-0 flex items-center justify-center border-b border-white/[0.06] transition-colors hover:bg-white/[0.05]"
          style={{ top: pct(h * 60), height: `${100 / 24}%` }}
          aria-label={`Book ${day.dateKey} at ${String(h).padStart(2, "0")}:00`}
        >
          <Plus className="h-3 w-3 text-white/40 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </button>
      ))}

      {bookings.map((b) => {
        const seg = segmentForDay(new Date(b.start), new Date(b.end), day, nextStart);
        if (!seg) return null;
        const full = seg.topMin === 0 && seg.bottomMin === 1440;
        const range = full ? "All day" : `${formatStudioTime(new Date(b.start))}–${formatStudioTime(new Date(b.end))}`;
        const editable = b.mine || canEditAny;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelectBooking(b)}
            className={`absolute left-0.5 right-0.5 z-[1] flex flex-col overflow-hidden rounded-md px-1.5 py-0.5 text-left text-[10px] leading-tight ring-1 transition ${
              b.mine
                ? "bg-emerald-500/25 ring-emerald-400/50 hover:bg-emerald-500/35"
                : `bg-sky-500/20 ring-sky-400/40 ${canEditAny ? "hover:bg-sky-500/30" : ""}`
            } ${editable ? "cursor-pointer" : "cursor-default"}`}
            style={{ top: pct(seg.topMin), height: pct(seg.bottomMin - seg.topMin), minHeight: "0.85rem" }}
            title={`${range}${b.title ? ` · ${b.title}` : ""}${b.mine ? "" : b.bookerName ? ` · ${b.bookerName}` : ""}`}
          >
            <span className="truncate font-medium text-white tabular-nums">{range}</span>
            <span className="truncate text-white/70">{b.title ?? (b.mine ? "Your session" : b.bookerName ?? "Booked")}</span>
          </button>
        );
      })}

      {day.isToday && now ? (
        <div className="pointer-events-none absolute left-0 right-0 z-[2]" style={{ top: pct(minutesIntoStudioDay(now)) }} aria-hidden>
          <div className="relative h-px bg-rose-400/90">
            <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-rose-400" />
          </div>
        </div>
      ) : null}
    </>
  );
}
