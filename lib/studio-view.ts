// Pure calendar-layout helpers for the studio week grid. Client + server safe.
import { studioParts, studioDayStartUtc, minutesIntoStudioDay } from "@/lib/studio-schedule";

export type DayColumn = { dateKey: string; startUtc: Date; isToday: boolean };
export type Segment = { topMin: number; bottomMin: number };

function pad(n: number): string { return String(n).padStart(2, "0"); }
function keyOf(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Advance/rewind a "YYYY-MM-DD" key by whole days (calendar-correct via UTC). */
export function addDaysKey(dateKey: string, days: number): string {
  const parts = dateKey.split("-").map(Number);
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** STUDIO_TZ-local day-of-week for an instant, 1=Mon..7=Sun. */
function studioIsoWeekday(utc: Date): number {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short" }).format(utc);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

/** 7 Monday-first DayColumns for the STUDIO_TZ week containing `anchor`. */
export function weekDays(anchor: Date, now: Date = new Date()): DayColumn[] {
  const p = studioParts(anchor);
  const anchorKey = keyOf(p);
  const iso = studioIsoWeekday(anchor);
  const mondayKey = addDaysKey(anchorKey, -(iso - 1));
  const todayKey = keyOf(studioParts(now));
  const out: DayColumn[] = [];
  for (let i = 0; i < 7; i++) {
    const dateKey = addDaysKey(mondayKey, i);
    out.push({ dateKey, startUtc: studioDayStartUtc(dateKey), isToday: dateKey === todayKey });
  }
  return out;
}

/** The booking's vertical span (local minutes, 0–1440) within `day`, or null. */
export function segmentForDay(
  bStart: Date, bEnd: Date, day: DayColumn, nextDayStartUtc: Date
): Segment | null {
  // No intersection with [dayStart, nextDayStart)?
  if (bEnd.getTime() <= day.startUtc.getTime() || bStart.getTime() >= nextDayStartUtc.getTime()) {
    return null;
  }
  const topMin = bStart.getTime() <= day.startUtc.getTime() ? 0 : minutesIntoStudioDay(bStart);
  const bottomMin = bEnd.getTime() >= nextDayStartUtc.getTime() ? 1440 : (minutesIntoStudioDay(bEnd) || 1440);
  return { topMin, bottomMin };
}
