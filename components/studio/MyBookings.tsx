"use client";

import type { Booking } from "@/app/studio/StudioBookingClient";
import { Button } from "@/components/ui/button";
import { formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export default function MyBookings({
  bookings, onEdit, onCancel,
}: {
  bookings: Booking[];
  onEdit: (b: Booking) => void;
  onCancel: (b: Booking) => void;
}) {
  const mineUpcoming = bookings
    .filter((b) => b.mine && new Date(b.start).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start));

  if (mineUpcoming.length === 0) return null;
  return (
    <section className="mt-8">
      {/* Scoped to the week in view — the grid's fetch window feeds this list. */}
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Your bookings this week</h2>
      <ul className="space-y-2">
        {mineUpcoming.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm">
            <span className="min-w-0 truncate">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-400 align-middle" aria-hidden />
              <span className="ml-2 tabular-nums">{formatStudioDate(new Date(b.start))} · {formatStudioTime(new Date(b.start))}–{formatStudioTime(new Date(b.end))}</span>
              {b.title ? <span className="text-muted-foreground"> — {b.title}</span> : null}
            </span>
            <span className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(b)}>Edit</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => onCancel(b)}>Cancel</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
