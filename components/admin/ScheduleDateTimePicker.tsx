"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// An in-flow (non-floating) date + time picker for the "Schedule send" modal.
// The native <input type="datetime-local"> opens a browser-drawn calendar that
// can't be sized or positioned in CSS — on a phone it overflowed the viewport and
// covered the actions. This renders the calendar and time INSIDE the modal, so it
// always fits the available width and scrolls with the modal body. Value is the
// same "YYYY-MM-DDTHH:mm" string a datetime-local produces, so callers are
// unchanged.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad2 = (n: number) => String(n).padStart(2, "0");

type Parts = { y: number; mo: number; d: number; h: number; mi: number };

function parse(v: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  return { y: +m[1]!, mo: +m[2]! - 1, d: +m[3]!, h: +m[4]!, mi: +m[5]! };
}
function toValue(p: Parts): string {
  return `${p.y}-${pad2(p.mo + 1)}-${pad2(p.d)}T${pad2(p.h)}:${pad2(p.mi)}`;
}

export default function ScheduleDateTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const parsed = parse(value);
  // Fallbacks for an unset value: show the current month, and default a newly
  // picked day / typed time to "now" so a bare pick still yields a sane datetime.
  const nowParts = useMemo<Parts>(() => {
    const n = new Date();
    return { y: n.getFullYear(), mo: n.getMonth(), d: n.getDate(), h: n.getHours(), mi: n.getMinutes() };
  }, []);
  const anchor = parsed ?? nowParts;
  const [view, setView] = useState({ y: anchor.y, mo: anchor.mo });

  const cells = useMemo(() => {
    const firstDow = (new Date(view.y, view.mo, 1).getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(view.y, view.mo + 1, 0).getDate();
    const out: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const monthLabel = new Date(view.y, view.mo, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const nd = new Date(v.y, v.mo + delta, 1);
      return { y: nd.getFullYear(), mo: nd.getMonth() };
    });

  const pickDay = (d: number) => {
    const t = parsed ?? nowParts; // keep the chosen time, or default to now
    onChange(toValue({ y: view.y, mo: view.mo, d, h: t.h, mi: t.mi }));
  };

  const setTime = (h: number, mi: number) => {
    const base = parsed ?? nowParts; // keep the chosen day, or default to today
    onChange(toValue({ y: base.y, mo: base.mo, d: base.d, h, mi }));
  };

  const isSelected = (d: number) =>
    !!parsed && parsed.y === view.y && parsed.mo === view.mo && parsed.d === d;

  const timeValue = parsed ? `${pad2(parsed.h)}:${pad2(parsed.mi)}` : "";

  return (
    <div className="rounded-md border border-border bg-card p-3">
      {/* Month navigation */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w.slice(0, 1)}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) =>
          d === null ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => pickDay(d)}
              aria-pressed={isSelected(d)}
              className={`flex aspect-square items-center justify-center rounded text-sm tabular-nums transition-colors ${
                isSelected(d)
                  ? "bg-white font-semibold text-black"
                  : "text-foreground hover:bg-white/10"
              }`}
            >
              {d}
            </button>
          )
        )}
      </div>

      {/* Time */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <label className="text-sm text-muted-foreground" htmlFor="schedule-time">Time</label>
        <input
          id="schedule-time"
          type="time"
          value={timeValue}
          onChange={(e) => {
            const parts = e.target.value.split(":");
            const h = Number(parts[0]);
            const mi = Number(parts[1]);
            if (Number.isFinite(h) && Number.isFinite(mi)) setTime(h, mi);
          }}
          className="rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}
