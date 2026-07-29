"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

// A brand-styled month/year picker popover — replaces the native <input type="month">
// (whose dropdown is OS-drawn and unstyleable). Value/onChange use the same
// "YYYY-MM" string the native input produced, so callers are unchanged. Matches the
// house calendar styling (see components/admin/ScheduleDateTimePicker) with the
// studio's emerald accent.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function MonthPicker({
  value, onChange,
}: {
  value: string; // "YYYY-MM"
  onChange: (v: string) => void;
}) {
  const selY = Number(value.slice(0, 4));
  const selM = Number(value.slice(5, 7)); // 1–12
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selY || new Date().getFullYear());
  const ref = useRef<HTMLDivElement>(null);

  // Re-centre the year on the selection each time it opens.
  useEffect(() => { if (open) setViewYear(selY || new Date().getFullYear()); }, [open, selY]);

  // Dismiss on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const label = selM >= 1 && selM <= 12 ? `${MONTHS[selM - 1]} ${selY}` : "Pick month";
  const pick = (month1: number) => {
    onChange(`${viewYear}-${String(month1).padStart(2, "0")}`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/10"
      >
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="tabular-nums">{label}</span>
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-white/10 bg-[#141414] p-2 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="mb-1 flex items-center justify-between px-1">
            <button type="button" onClick={() => setViewYear((y) => y - 1)} aria-label="Previous year" className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium tabular-nums">{viewYear}</span>
            <button type="button" onClick={() => setViewYear((y) => y + 1)} aria-label="Next year" className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => {
              const active = viewYear === selY && i + 1 === selM;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(i + 1)}
                  aria-pressed={active}
                  className={`rounded-md px-2 py-2 text-sm transition-colors ${active ? "bg-emerald-500 font-semibold text-black" : "text-foreground hover:bg-white/10"}`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
