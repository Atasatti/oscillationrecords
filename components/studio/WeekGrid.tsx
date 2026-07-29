"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import { type DayColumn, segmentForDay, addDaysKey } from "@/lib/studio-view";
import { STUDIO_TZ, studioDayStartUtc, formatStudioTime, minutesIntoStudioDay } from "@/lib/studio-schedule";

const HOUR_PX = 44; // row height per hour
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const AXIS = 56; // width of the left time axis

const wd = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, weekday: "short" }).format(d);
const dn = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, day: "numeric" }).format(d);

export default function WeekGrid({
  days, bookings, onSelectSlot, onSelectBooking,
}: {
  days: DayColumn[];
  bookings: Booking[];
  onSelectSlot: (dateKey: string, hour: number) => void;
  onSelectBooking: (b: Booking) => void;
}) {
  // Client-only "now" (set after mount to avoid an SSR/hydration mismatch), ticked
  // each minute so the current-time line stays honest without a reload.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.015]">
      <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `${AXIS}px repeat(7, 1fr)` }}>
        {/* Header row: empty axis corner + 7 day headers */}
        <div className="border-b border-white/10" />
        {days.map((d) => (
          <div key={d.dateKey} className="flex flex-col items-center gap-1 border-b border-l border-white/10 py-2.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wd(d.startUtc)}</span>
            <span
              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm ${
                d.isToday ? "bg-emerald-500 font-semibold text-black" : "text-white"
              }`}
            >
              {dn(d.startUtc)}
            </span>
          </div>
        ))}

        {/* Time axis */}
        <div className="relative" style={{ height: HOUR_PX * 24 }}>
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground/70"
              style={{ top: h * HOUR_PX }}
            >
              {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const nextStart = studioDayStartUtc(addDaysKey(day.dateKey, 1));
          return (
            <div key={day.dateKey} className={`relative border-l border-white/10 ${day.isToday ? "bg-emerald-500/[0.04]" : ""}`} style={{ height: HOUR_PX * 24 }}>
              {/* Clickable hour cells with a hover "book" affordance */}
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSelectSlot(day.dateKey, h)}
                  className="group absolute left-0 right-0 flex items-center justify-center border-b border-white/[0.06] transition-colors hover:bg-white/[0.05]"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                  aria-label={`Book ${wd(day.startUtc)} ${dn(day.startUtc)} at ${String(h).padStart(2, "0")}:00`}
                >
                  <Plus className="h-3.5 w-3.5 text-white/40 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </button>
              ))}

              {/* Booking blocks */}
              {bookings.map((b) => {
                const seg = segmentForDay(new Date(b.start), new Date(b.end), day, nextStart);
                if (!seg) return null;
                const top = (seg.topMin / 60) * HOUR_PX;
                const height = Math.max(((seg.bottomMin - seg.topMin) / 60) * HOUR_PX - 2, 22);
                const range = `${formatStudioTime(new Date(b.start))}–${formatStudioTime(new Date(b.end))}`;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBooking(b)}
                    className={`absolute left-1 right-1 z-[1] flex flex-col overflow-hidden rounded-md px-2 py-1 text-left text-[11px] leading-tight ring-1 transition ${
                      b.mine
                        ? "cursor-pointer bg-emerald-500/25 ring-emerald-400/50 hover:bg-emerald-500/35"
                        : "cursor-default bg-sky-500/20 ring-sky-400/40"
                    }`}
                    style={{ top, height }}
                    title={`${range}${b.title ? ` · ${b.title}` : ""}${b.mine ? "" : b.bookerName ? ` · ${b.bookerName}` : ""}`}
                  >
                    <span className="truncate font-medium text-white tabular-nums">{range}</span>
                    <span className="truncate text-white/70">
                      {b.title ?? (b.mine ? "Your session" : b.bookerName ?? "Booked")}
                    </span>
                  </button>
                );
              })}

              {/* Live current-time line, today only */}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
