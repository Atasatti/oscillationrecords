# Data retention & account deletion

What personal data Oscillation Records holds, what a user gets when they export
it, and what happens to each collection when they delete their account.

The machine-readable version of this table is `lib/personal-data.ts`
(`PERSONAL_DATA_INVENTORY`). `lib/personal-data.test.ts` reads
`prisma/schema.prisma` and fails the build if a model carrying a user link is
missing from that inventory, or if an entry's declared disposition isn't actually
implemented in the export / deletion route. **Adding a user-linked model without
deciding its fate is a test failure, not a silent gap.**

## Dispositions

| | Meaning |
|---|---|
| **cascade** | Removed automatically by Prisma's `onDelete: Cascade` (models with a real `user` relation). |
| **delete** | Explicitly deleted — the row is only ever about that person. |
| **anonymize** | Row kept, the user reference cleared. A shared business record that doesn't need to name anyone. |
| **redact** | Row kept, identifying *fields* overwritten as well as the reference. |
| **retain** | Kept intact and identifiable, under the documented basis below. |

## Inventory

| Collection | Link to the user | In export | On deletion |
|---|---|---|---|
| `User` | id / email | yes | delete |
| `Account` (OAuth tokens) | `userId` relation | **no** — minimisation | cascade |
| `Session` | `userId` relation | **no** — no user value | cascade |
| `UserProfile` | `userId` relation | yes | cascade |
| `PlayEvent` (listening history) | `userId` relation | yes | cascade |
| `PageView` (browsing history) | `userId` loose | yes | delete |
| `BenertRemixEntry` (+ its S3 audio) | `userId` relation | yes | cascade + S3 object deleted |
| `NewsletterSubscriber` | `email` | yes | delete |
| `SavedView` | `userId` relation | yes | cascade |
| `ContactMessage` — sent by them | `userId` loose | yes | **redact** |
| `ContactMessage` — assigned to them | `assigneeId` loose | yes | anonymize |
| `MessageReply` | `authorId`, `authorEmail` | yes | anonymize |
| `TaskComment` | `authorId`, `authorEmail`, `mentions[]` | yes | anonymize |
| `OutreachTask` | `assigneeId` loose | yes | anonymize |
| `Asset` | `uploadedById` loose | yes | anonymize |
| `Campaign` | `createdById` loose | yes | anonymize |
| `ErrorLog` | `userEmail` loose | yes | anonymize |
| `AuditLog` | `actorId`, `actorEmail`, `actorRole` | yes | **retain — see below** |

`LinkClick`, and `PageView` / `PlayEvent` rows carrying only a `visitorId`, hold
no account link at all. They are pseudonymous first-party analytics tied to a
cookie, not to an identity, and are out of scope for account deletion.

### Why contact messages are redacted rather than deleted

A contact message is correspondence with the label: it may be mid-conversation,
it carries the label's own replies, and the ticket is an operational record of a
business exchange. Deleting it would destroy the label's side of a conversation
along with the user's.

So the identity goes and the substance stays: `name` becomes
`Deleted user`, `email` becomes `deleted@removed.invalid` (an RFC 2606 reserved
domain that can never receive mail, so a stray `mailto:` can't reach anyone), and
`userId` is cleared. The message body and reply thread remain. Retention basis:
legitimate interest in maintaining records of business correspondence.

Note the message body is user-written free text and could itself contain personal
information. Redaction covers the structured identity fields only. A user asking
for a specific message to be erased in full should be handled manually.

## The one retention exception: `AuditLog`

**What is kept:** one row per meaningful admin action, with the actor's email and
their role at the time, the action, the affected resource, an IP and a user agent.

**Why:** security investigation, fraud prevention and accountability. An audit
trail that a user can rewrite by deleting their account is not an audit trail — the
account most worth deleting is the one that did something worth auditing.

**Basis:** legitimate interest in the security and integrity of the service.

**How long:** **24 months** from the action, then purged.

**Limits on the exception:**

- It applies *only* to `AuditLog`. Every other collection is deleted or anonymised.
- Audit entries are surfaced read-only in the admin, never used for marketing,
  profiling, personalisation or any purpose beyond investigating what happened.
- The user's export includes their full audit history, so the retention is
  transparent to the person it concerns rather than buried in a policy page.
- The export payload carries a `retention` block naming this exception inline.

**Purging.** Retention is enforced by running:

```bash
# dry run — counts what would go, writes nothing
node --env-file=.env --use-system-ca scripts/purge-audit-logs.mjs
# delete entries older than the retention window
node --env-file=.env --use-system-ca scripts/purge-audit-logs.mjs --apply
```

This is **not automatic** — nothing schedules it today. Until it is scheduled,
"24 months" is a stated policy that depends on someone running the script. Wiring
it to a cron (Vercel cron hitting an authenticated route, or a scheduled job) is
the outstanding piece of work to make the policy self-enforcing.

## What the account page promises

`app/(main)/account/page.tsx` must describe the behaviour above accurately — it
previously promised deletion of "all associated data" while contact messages and
627 page views survived untouched. It now states what is deleted, what is
anonymised, and that audit entries are retained for 24 months.
