"use client";

import { useEffect, useState } from "react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import type { DayColumn } from "@/lib/studio-view";
import { STUDIO_TZ } from "@/lib/studio-schedule";
import DayColumnBody, { HOUR_PX, HOURS } from "@/components/studio/DayColumnBody";

const wd = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, weekday: "short" }).format(d);
const dn = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, day: "numeric" }).format(d);

// Mobile single-day calendar: a Mon–Sun chip strip to pick the day, then the same
// vertical time-grid as the desktop week, full width for thumbs.
export default function DayView({
  days, selectedKey, onSelectDay, bookings, canEditAny, onSelectSlot, onSelectBooking,
}: {
  days: DayColumn[];
  selectedKey: string;
  onSelectDay: (dateKey: string) => void;
  bookings: Booking[];
  canEditAny: boolean;
  onSelectSlot: (dateKey: string, hour: number) => void;
  onSelectBooking: (b: Booking) => void;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const day = days.find((d) => d.dateKey === selectedKey) ?? days[0]!;

  return (
    <div>
      {/* Day picker */}
      <div className="mb-3 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const active = d.dateKey === day.dateKey;
          return (
            <button
              key={d.dateKey}
              type="button"
              onClick={() => onSelectDay(d.dateKey)}
              aria-current={active ? "date" : undefined}
              className={`flex flex-col items-center rounded-lg py-1.5 transition-colors ${active ? "bg-white/10" : "hover:bg-white/5"}`}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wd(d.startUtc)}</span>
              <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm ${d.isToday ? "bg-emerald-500 font-semibold text-black" : active ? "text-white" : "text-muted-foreground"}`}>
                {dn(d.startUtc)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Single-day grid */}
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.015]">
        <div className="grid" style={{ gridTemplateColumns: `56px 1fr` }}>
          <div className="relative" style={{ height: HOUR_PX * 24 }}>
            {HOURS.map((h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground/70" style={{ top: h * HOUR_PX }}>
                {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>
          <div className={`relative border-l border-white/10 ${day.isToday ? "bg-emerald-500/[0.04]" : ""}`} style={{ height: HOUR_PX * 24 }}>
            <DayColumnBody day={day} bookings={bookings} canEditAny={canEditAny} now={now} onSelectSlot={onSelectSlot} onSelectBooking={onSelectBooking} />
          </div>
        </div>
      </div>
    </div>
  );
}
