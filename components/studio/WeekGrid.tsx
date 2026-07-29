"use client";

import { useEffect, useState } from "react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import type { DayColumn } from "@/lib/studio-view";
import { STUDIO_TZ } from "@/lib/studio-schedule";
import DayColumnBody, { HOURS } from "@/components/studio/DayColumnBody";

const AXIS = 52; // left time-axis width
const wd = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, weekday: "short" }).format(d);
const dn = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, day: "numeric" }).format(d);
const hourTop = (h: number) => `${(h / 24) * 100}%`;

export default function WeekGrid({
  days, bookings, canEditAny, onSelectSlot, onSelectBooking,
}: {
  days: DayColumn[];
  bookings: Booking[];
  canEditAny: boolean;
  onSelectSlot: (dateKey: string, hour: number) => void;
  onSelectBooking: (b: Booking) => void;
}) {
  // Client-only "now" (set after mount to avoid a hydration mismatch), ticked each
  // minute so the current-time line stays honest without a reload.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.015]">
      {/* Day headers */}
      <div className="grid shrink-0" style={{ gridTemplateColumns: `${AXIS}px repeat(7, 1fr)` }}>
        <div className="border-b border-white/10" />
        {days.map((d) => (
          <div key={d.dateKey} className="flex flex-col items-center gap-0.5 border-b border-l border-white/10 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wd(d.startUtc)}</span>
            <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${d.isToday ? "bg-emerald-500 font-semibold text-black" : "text-white"}`}>
              {dn(d.startUtc)}
            </span>
          </div>
        ))}
      </div>

      {/* Time axis + day columns, filling the remaining height */}
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: `${AXIS}px repeat(7, 1fr)` }}>
        <div className="relative">
          {HOURS.map((h) => (
            <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground/70" style={{ top: hourTop(h) }}>
              {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div key={day.dateKey} className={`relative h-full border-l border-white/10 ${day.isToday ? "bg-emerald-500/[0.04]" : ""}`}>
            <DayColumnBody day={day} bookings={bookings} canEditAny={canEditAny} now={now} onSelectSlot={onSelectSlot} onSelectBooking={onSelectBooking} />
          </div>
        ))}
      </div>
    </div>
  );
}
