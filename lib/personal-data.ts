// The inventory of every collection holding personal or user-linked data, and
// what happens to each one when a user exports or deletes their account.
//
// This exists because the two account routes drifted from the schema: exports
// covered four collections while ten held user-linked rows, and deletion relied
// on Prisma's cascade — which only fires for the six models with a real `user`
// relation, silently missing every model that stores a bare `userId` string.
//
// lib/personal-data.test.ts reads prisma/schema.prisma and fails if a model
// carrying a user link is missing here, or if an entry's declared disposition
// isn't actually implemented in the corresponding route. Adding a user-linked
// model without deciding its fate is therefore a test failure, not a silent gap.
//
// Retention policy narrative: docs/DATA-RETENTION.md.

export type Disposition =
  /** Removed by Prisma's onDelete: Cascade via a real `user` relation. */
  | "cascade"
  /** Explicitly deleted — the row is only about this person. */
  | "delete"
  /** Row kept, the user reference cleared. Business record with no need of identity. */
  | "anonymize"
  /** Row kept, identifying FIELDS overwritten as well as the reference. */
  | "redact"
  /** Kept intact and identifiable, under a documented retention basis. */
  | "retain";

export type PersonalDataEntry = {
  /** Prisma model name, exactly as declared in schema.prisma. */
  model: string;
  /** The field(s) tying a row to a user. */
  link: string;
  /** Included in GET /api/account/export. */
  exported: boolean;
  onDelete: Disposition;
  /** Why this disposition — the justification a reviewer would ask for. */
  reason: string;
};

export const PERSONAL_DATA_INVENTORY: readonly PersonalDataEntry[] = [
  // --- The account itself -------------------------------------------------
  {
    model: "User",
    link: "id / email",
    exported: true,
    onDelete: "delete",
    reason: "The account record. Deleted directly; everything below follows from it.",
  },
  {
    model: "Account",
    link: "userId relation",
    exported: false,
    onDelete: "cascade",
    reason:
      "OAuth provider tokens. Deliberately NOT exported (data minimisation) — useless to the user and sensitive if an export leaked.",
  },
  {
    model: "Session",
    link: "userId relation",
    exported: false,
    onDelete: "cascade",
    reason: "Server-side session rows. Nothing of value to the user; removed with the account.",
  },
  {
    model: "UserProfile",
    link: "userId relation",
    exported: true,
    onDelete: "cascade",
    reason: "Self-declared demographics. Purely personal — exported in full, deleted in full.",
  },

  // --- Things they did ----------------------------------------------------
  {
    model: "PlayEvent",
    link: "userId relation",
    exported: true,
    onDelete: "cascade",
    reason: "Listening history. Personal behavioural data with no counterparty — deleted outright.",
  },
  {
    model: "PageView",
    link: "userId (loose ObjectId, no relation)",
    exported: true,
    onDelete: "delete",
    reason:
      "Browsing history. Same nature as PlayEvent, but the loose link means no cascade fires — hence an explicit delete. Anonymous rows (visitorId only) are untouched.",
  },
  {
    model: "BenertRemixEntry",
    link: "userId relation",
    exported: true,
    onDelete: "cascade",
    reason:
      "Their competition submission. The uploaded audio is deleted from S3 alongside it (app/api/account/route.ts) — the cascade removes the only reference to the object.",
  },
  {
    model: "NewsletterSubscriber",
    link: "email (no relation)",
    exported: true,
    onDelete: "delete",
    reason: "Marketing consent, keyed by email. Deleted explicitly since there is no relation to cascade.",
  },
  {
    model: "SavedView",
    link: "userId relation",
    exported: true,
    onDelete: "cascade",
    reason: "Their private admin view presets. Personal preference data, no shared value.",
  },

  // --- Correspondence -----------------------------------------------------
  {
    model: "ContactMessage",
    link: "userId (submitter) / assigneeId (staff) — both loose",
    exported: true,
    onDelete: "redact",
    reason:
      "Correspondence with the label. Identity is erased (name, email, userId) but the message and its reply thread are kept: a ticket may be mid-conversation and carries the label's own replies. Retained on legitimate-interest grounds — see docs/DATA-RETENTION.md. Also clears assigneeId where they were the staff member triaging a ticket.",
  },
  {
    model: "MessageReply",
    link: "authorId + authorEmail (loose)",
    exported: true,
    onDelete: "anonymize",
    reason:
      "Replies they wrote as staff on someone else's ticket. Deleting them would tear holes in a thread others rely on, so the authorship is cleared and the body kept.",
  },

  // --- Staff activity -----------------------------------------------------
  {
    model: "TaskComment",
    link: "authorId + authorEmail + mentions[] (loose)",
    exported: true,
    onDelete: "anonymize",
    reason:
      "Comments they wrote on shared tasks, plus any @mention of them. Authorship cleared, body kept — same reasoning as MessageReply.",
  },
  {
    model: "OutreachTask",
    link: "assigneeId (loose)",
    exported: true,
    onDelete: "anonymize",
    reason: "Tasks assigned to them. The task is the label's work item; only the assignment is personal.",
  },
  {
    model: "Asset",
    link: "uploadedById (loose)",
    exported: true,
    onDelete: "anonymize",
    reason: "Files they uploaded to the DAM. The asset belongs to the label; the upload attribution does not.",
  },
  {
    model: "Campaign",
    link: "createdById (loose)",
    exported: true,
    onDelete: "anonymize",
    reason: "Newsletter campaigns they composed. Business record; authorship attribution cleared.",
  },

  // --- Operational logs ---------------------------------------------------
  {
    model: "ErrorLog",
    link: "userEmail (loose)",
    exported: true,
    onDelete: "anonymize",
    reason:
      "Errors attributed to them while signed in. The error itself is a debugging record; the email is incidental and is cleared. Rows are de-duplicated by fingerprint, so one row may cover several people.",
  },
  {
    model: "AuditLog",
    link: "actorId + actorEmail + actorRole (loose)",
    exported: true,
    onDelete: "retain",
    reason:
      "THE ONE RETENTION EXCEPTION. Admin actions stay attributable for security, fraud investigation and accountability — an audit trail that a deletion can rewrite is not an audit trail. Kept 24 months from the action, then purged (scripts/purge-audit-logs.mjs). Exported to the user in full so the retention is transparent to them. See docs/DATA-RETENTION.md.",
  },
];

/** Placeholders written over redacted identity fields, so a redacted row is
 *  visibly redacted in the admin rather than looking like a blank submission.
 *  The address is under .invalid, which is reserved and can never be delivered
 *  to (RFC 2606), so a stray mailto: can't reach a real inbox. */
export const REDACTED_NAME = "Deleted user";
export const REDACTED_EMAIL = "deleted@removed.invalid";

/** Audit entries are purged this long after the action they record. */
export const AUDIT_RETENTION_MONTHS = 24;

export const entriesExported = () => PERSONAL_DATA_INVENTORY.filter((e) => e.exported);

/** Entries needing explicit work at deletion time — i.e. everything the Prisma
 *  cascade does NOT handle for us. */
export const entriesNeedingDeletionWork = () =>
  PERSONAL_DATA_INVENTORY.filter(
    (e) => e.onDelete === "delete" || e.onDelete === "anonymize" || e.onDelete === "redact"
  );
