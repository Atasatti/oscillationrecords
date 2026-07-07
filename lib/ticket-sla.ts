import type { TicketStatus } from "@/lib/contact-ticket";

// Response-time SLA for inbound contact tickets. A ticket is "on the clock" only
// while it's still Open (un-actioned) — once it moves to In progress / Resolved
// someone has picked it up, so the badge drops off. Distinct from the
// needs-attention alerts (#21): this is a per-ticket badge on the inbox itself.
//
// The target is a single knob here (a few days is right for a small label); the
// helper takes `targetDays` so it can be wired to a setting later.
export const SLA_RESPONSE_DAYS = 3;

const DAY = 86_400_000;

export type SlaState =
  | { kind: "overdue"; days: number; label: string }
  | { kind: "due_soon"; label: string }
  | { kind: "none" };

/** SLA badge state for a ticket. Only Open tickets that are overdue or within a
 *  day of the target return a badge; everything else is "none" (no clutter). */
export function slaState(
  createdAt: string,
  status: TicketStatus,
  targetDays: number = SLA_RESPONSE_DAYS,
  now: number = Date.now()
): SlaState {
  if (status !== "open") return { kind: "none" };
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return { kind: "none" };
  const due = created + targetDays * DAY;
  if (now > due) {
    const days = Math.max(1, Math.ceil((now - due) / DAY));
    return { kind: "overdue", days, label: `SLA overdue ${days}d` };
  }
  if (now >= due - DAY) return { kind: "due_soon", label: "SLA due soon" };
  return { kind: "none" };
}
