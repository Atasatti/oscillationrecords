// Pure studio-booking time logic — timezone conversion, overlap and validation.
// No DB, no server-only imports: safe to import from route handlers AND the client.
// All bookings are stored as UTC instants but entered/displayed in STUDIO_TZ.

export const STUDIO_TZ = "Europe/London";
export const MIN_MINUTES = 30;
export const MAX_MINUTES = 24 * 60; // a single booking caps at 24h
export const HORIZON_DAYS = 180;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

function parseDateKey(s: string): { y: number; mo: number; d: number } | null {
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = +m[1]!, mo = +m[2]!, d = +m[3]!;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function parseHM(s: string): { h: number; mi: number } | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const h = +m[1]!, mi = +m[2]!;
  if (h > 23 || mi > 59) return null;
  return { h, mi };
}

/** Offset of STUDIO_TZ (minutes ahead of UTC) at a given instant. BST → +60. */
function tzOffsetMinutes(utc: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(utc)) if (p.type !== "literal") map[p.type] = +p.value;
  const asUtc = Date.UTC(map.year!, map.month! - 1, map.day!, map.hour! % 24, map.minute!, map.second!);
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** A wall-clock date+time in STUDIO_TZ → the absolute UTC instant, DST-correct. */
export function zonedWallTimeToUtc(dateKey: string, timeHM: string): Date {
  const d = parseDateKey(dateKey);
  const t = parseHM(timeHM);
  if (!d || !t) throw new Error(`Invalid date/time: ${dateKey} ${timeHM}`);
  // Treat the wall time as UTC, then subtract the zone offset at that instant.
  // Refine once so a DST change straddling the guess is corrected.
  const guess = Date.UTC(d.y, d.mo - 1, d.d, t.h, t.mi);
  const off1 = tzOffsetMinutes(new Date(guess));
  let utc = guess - off1 * 60000;
  const off2 = tzOffsetMinutes(new Date(utc));
  if (off2 !== off1) utc = guess - off2 * 60000;
  return new Date(utc);
}

/** STUDIO_TZ-local calendar parts of a UTC instant. */
export function studioParts(utc: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(utc)) if (p.type !== "literal") map[p.type] = p.value;
  return { year: +map.year!, month: +map.month!, day: +map.day!, hour: (+map.hour!) % 24, minute: +map.minute! };
}

/** Minutes since STUDIO_TZ-local midnight (0–1439). */
export function minutesIntoStudioDay(utc: Date): number {
  const p = studioParts(utc);
  return p.hour * 60 + p.minute;
}

/** UTC instant of STUDIO_TZ-local midnight for a "YYYY-MM-DD" day. */
export function studioDayStartUtc(dateKey: string): Date {
  return zonedWallTimeToUtc(dateKey, "00:00");
}

export function formatStudioTime(utc: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(utc);
}
export function formatStudioDate(utc: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: STUDIO_TZ, weekday: "short", day: "numeric", month: "short" }).format(utc);
}

/** Half-open intervals [aStart,aEnd) and [bStart,bEnd) overlap? Touching = false. */
export function bookingsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export type BookingTimeInput = { startDate: string; startTime: string; endDate: string; endTime: string };
export type ValidatedBooking = { ok: true; start: Date; end: Date } | { ok: false; error: string };

/** Validate + normalize a booking's time window. `now` is injectable for tests. */
export function validateBookingInput(input: BookingTimeInput, now: Date = new Date()): ValidatedBooking {
  let start: Date, end: Date;
  try {
    start = zonedWallTimeToUtc(input.startDate, input.startTime);
    end = zonedWallTimeToUtc(input.endDate, input.endTime);
  } catch {
    return { ok: false, error: "Invalid date or time." };
  }
  const durMin = (end.getTime() - start.getTime()) / 60000;
  if (durMin <= 0) return { ok: false, error: "End time must be after the start time." };
  if (durMin < MIN_MINUTES) return { ok: false, error: `Minimum booking is ${MIN_MINUTES} minutes.` };
  if (durMin > MAX_MINUTES) return { ok: false, error: "A single booking can be at most 24 hours." };
  // 5-minute slack so a booking made for "now" isn't rejected by clock skew.
  if (start.getTime() < now.getTime() - 5 * 60000) {
    return { ok: false, error: "You can't book a time in the past." };
  }
  const horizon = now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000;
  if (start.getTime() > horizon) {
    return { ok: false, error: `Bookings can be made up to ${HORIZON_DAYS} days ahead.` };
  }
  return { ok: true, start, end };
}
