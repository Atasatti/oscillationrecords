"use client";

import { Plus } from "lucide-react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import { type DayColumn, segmentForDay, addDaysKey } from "@/lib/studio-view";
import { studioDayStartUtc, formatStudioTime, minutesIntoStudioDay } from "@/lib/studio-schedule";

// Shared vertical time-grid for a single day — used by the desktop week grid (×7)
// and the mobile day view (×1), so booking blocks and the "now" line render
// identically in both. The parent supplies the positioned/relative container and
// the ticking `now`; this fills it with hour cells, blocks, and the now-line.
export const HOUR_PX = 44;
export const HOURS = Array.from({ length: 24 }, (_, h) => h);

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
          style={{ top: h * HOUR_PX, height: HOUR_PX }}
          aria-label={`Book ${day.dateKey} at ${String(h).padStart(2, "0")}:00`}
        >
          <Plus className="h-3.5 w-3.5 text-white/40 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </button>
      ))}

      {bookings.map((b) => {
        const seg = segmentForDay(new Date(b.start), new Date(b.end), day, nextStart);
        if (!seg) return null;
        const top = (seg.topMin / 60) * HOUR_PX;
        const height = Math.max(((seg.bottomMin - seg.topMin) / 60) * HOUR_PX - 2, 22);
        const full = seg.topMin === 0 && seg.bottomMin === 1440;
        const range = full ? "All day" : `${formatStudioTime(new Date(b.start))}–${formatStudioTime(new Date(b.end))}`;
        const editable = b.mine || canEditAny;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelectBooking(b)}
            className={`absolute left-1 right-1 z-[1] flex flex-col overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight ring-1 transition ${
              b.mine
                ? "bg-emerald-500/25 ring-emerald-400/50 hover:bg-emerald-500/35"
                : `bg-sky-500/20 ring-sky-400/40 ${canEditAny ? "hover:bg-sky-500/30" : ""}`
            } ${editable ? "cursor-pointer" : "cursor-default"}`}
            style={{ top, height }}
            title={`${range}${b.title ? ` · ${b.title}` : ""}${b.mine ? "" : b.bookerName ? ` · ${b.bookerName}` : ""}`}
          >
            <span className="truncate font-medium text-white tabular-nums">{range}</span>
            <span className="truncate text-white/70">{b.title ?? (b.mine ? "Your session" : b.bookerName ?? "Booked")}</span>
          </button>
        );
      })}

      {day.isToday && now ? (
        <div
          className="pointer-events-none absolute left-0 right-0 z-[2]"
          style={{ top: (minutesIntoStudioDay(now) / 60) * HOUR_PX }}
          aria-hidden
        >
          <div className="relative h-px bg-rose-400/90">
            <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-rose-400" />
          </div>
        </div>
      ) : null}
    </>
  );
}
