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
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your upcoming bookings</h2>
      <ul className="space-y-2">
        {mineUpcoming.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>
              {formatStudioDate(new Date(b.start))} · {formatStudioTime(new Date(b.start))}–{formatStudioTime(new Date(b.end))}
              {b.title ? ` — ${b.title}` : ""}
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onEdit(b)}>Edit</Button>
              <Button type="button" variant="outline" onClick={() => onCancel(b)}>Cancel</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
