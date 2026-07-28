"use client";

import type { Booking } from "@/app/studio/StudioBookingClient";
import { type DayColumn, segmentForDay, addDaysKey } from "@/lib/studio-view";
import { studioDayStartUtc, formatStudioTime } from "@/lib/studio-schedule";

const HOUR_PX = 40; // row height per hour
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function WeekGrid({
  days, bookings, onSelectSlot, onSelectBooking,
}: {
  days: DayColumn[];
  bookings: Booking[];
  onSelectSlot: (dateKey: string, hour: number) => void;
  onSelectBooking: (b: Booking) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
        {/* Header row */}
        <div />
        {days.map((d) => (
          <div key={d.dateKey} className={`border-b border-white/10 pb-2 text-center text-xs ${d.isToday ? "text-emerald-400" : "text-muted-foreground"}`}>
            {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric" }).format(d.startUtc)}
          </div>
        ))}

        {/* Time axis + day columns */}
        <div className="relative" style={{ height: HOUR_PX * 24 }}>
          {HOURS.map((h) => (
            <div key={h} className="absolute right-1 text-[10px] text-muted-foreground" style={{ top: h * HOUR_PX - 6 }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {days.map((day) => {
          const nextStart = studioDayStartUtc(addDaysKey(day.dateKey, 1));
          return (
            <div key={day.dateKey} className="relative border-l border-white/10" style={{ height: HOUR_PX * 24 }}>
              {/* Clickable hour cells */}
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSelectSlot(day.dateKey, h)}
                  className="absolute left-0 right-0 border-b border-white/5 hover:bg-white/5"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                  aria-label={`Book ${day.dateKey} ${String(h).padStart(2, "0")}:00`}
                />
              ))}
              {/* Booking blocks */}
              {bookings.map((b) => {
                const seg = segmentForDay(new Date(b.start), new Date(b.end), day, nextStart);
                if (!seg) return null;
                const top = (seg.topMin / 60) * HOUR_PX;
                const height = Math.max(((seg.bottomMin - seg.topMin) / 60) * HOUR_PX, 14);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBooking(b)}
                    className={`absolute left-1 right-1 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${b.mine ? "bg-emerald-500/30 ring-1 ring-emerald-400/50" : "bg-sky-500/25 ring-1 ring-sky-400/40"}`}
                    style={{ top, height }}
                    title={`${formatStudioTime(new Date(b.start))}–${formatStudioTime(new Date(b.end))}${b.title ? ` · ${b.title}` : ""}`}
                  >
                    <span className="block truncate font-medium">{formatStudioTime(new Date(b.start))} {b.title ?? (b.mine ? "Your booking" : "Booked")}</span>
                    {b.bookerName ? <span className="block truncate text-white/70">{b.mine ? "You" : b.bookerName}</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
