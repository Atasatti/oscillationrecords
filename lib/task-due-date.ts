// Due-date validation for tasks. Pure — shared by the tasks UI (exact,
// local-timezone check) and the API routes (defense-in-depth with a timezone
// grace). The date input produces a DATE-ONLY string ("YYYY-MM-DD"), so "past"
// means "a calendar day before the admin's today", and only the admin's browser
// knows which day that is — the server sees an instant and must not reject
// "today" for an admin west of UTC.

/** Today as a YYYY-MM-DD string in the LOCAL timezone (the admin's browser). */
export function localTodayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Exact client-side rule: a date-only string strictly before local today.
 *  (ISO date strings compare correctly as plain strings.) */
export function isPastDueDate(dueAt: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(dueAt) && dueAt.slice(0, 10) < today;
}

/**
 * Server-side rule. A "YYYY-MM-DD" body value parses as midnight UTC, so an
 * admin at UTC-12 picking their (legitimate) today submits an instant up to
 * ~36h before the server's clock. The grace makes "today anywhere on Earth"
 * always acceptable while anything two or more days back still 400s — the
 * exact-day enforcement lives client-side where the admin's timezone is known.
 */
export const DUE_DATE_SERVER_GRACE_MS = 36 * 60 * 60 * 1000;

export function isClearlyPastDue(dueAt: unknown, now: number = Date.now()): boolean {
  if (typeof dueAt !== "string" || !dueAt) return false;
  const t = new Date(dueAt).getTime();
  return Number.isFinite(t) && t < now - DUE_DATE_SERVER_GRACE_MS;
}

export const PAST_DUE_ERROR = "Due date cannot be in the past";
