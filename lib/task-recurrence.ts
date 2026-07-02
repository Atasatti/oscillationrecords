// Recurring outreach tasks. A task with a `recurrence` cadence spawns its next
// occurrence when completed. Pure date logic here; the spawn happens in the API.

export const RECURRENCE_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
] as const;

export type Recurrence = (typeof RECURRENCE_OPTIONS)[number]["value"];

const KEYS: readonly string[] = RECURRENCE_OPTIONS.map((o) => o.value);

export function isRecurrence(v: unknown): v is Recurrence {
  return typeof v === "string" && KEYS.includes(v);
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

function addInterval(d: Date, r: Recurrence): Date {
  const n = new Date(d);
  if (r === "weekly") n.setDate(n.getDate() + 7);
  else if (r === "biweekly") n.setDate(n.getDate() + 14);
  else n.setMonth(n.getMonth() + 1); // monthly
  return n;
}

/**
 * The next due date for a recurring task when it's completed: advance from its
 * current due date (or `now` if it has none), rolling forward until the result is
 * in the future — so a badly-overdue task doesn't spawn another past-due copy.
 */
export function nextDueDate(r: Recurrence, base: Date | null, now: Date): Date {
  let next = addInterval(base ?? now, r);
  let guard = 0;
  while (next.getTime() <= now.getTime() && guard < 520) {
    next = addInterval(next, r);
    guard++;
  }
  return next;
}
