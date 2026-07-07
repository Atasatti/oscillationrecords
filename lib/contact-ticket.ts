// Ticket triage vocabulary for ContactMessage (the public Contact-form inbox).
// Pure — safe to import on server or client.

export const TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["low", "medium", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && (TICKET_STATUSES as readonly string[]).includes(v);
}

export function isTicketPriority(v: unknown): v is TicketPriority {
  return typeof v === "string" && (TICKET_PRIORITIES as readonly string[]).includes(v);
}

// resolved == handled. These keep the legacy `handled` boolean and the richer
// `status` in lockstep so the needs-attention "unread" count (which reads
// handled:false) keeps working without knowing about statuses.
export function statusFromHandled(handled: boolean): TicketStatus {
  return handled ? "resolved" : "open";
}

export function handledFromStatus(status: TicketStatus): boolean {
  return status === "resolved";
}

// Coerce a stored status, falling back to the handled flag for legacy rows that
// predate the status column.
export function normalizeStatus(status: unknown, handled: boolean): TicketStatus {
  return isTicketStatus(status) ? status : statusFromHandled(handled);
}

export function normalizePriority(priority: unknown): TicketPriority {
  return isTicketPriority(priority) ? priority : "medium";
}
