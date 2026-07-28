# Studio Booking — design spec

**Date:** 2026-07-28
**Status:** Approved (design), pending implementation plan
**Author:** Claude + BigHeck

## Summary

An access-controlled studio booking area for the Oscillation Records site. People
sign in with Google (existing NextAuth), and only those on an admin-managed email
**allowlist** may open the booking page. Allowed users see a week time-grid
calendar of what's booked and what's free, and book a session by picking a date
and a start/end time. Booking is **free** and **instant** (no payment, no
approval step). Bookers can cancel and edit their own upcoming sessions; the owner
can manage the allowlist and cancel anyone's booking.

## Decisions (locked with the user)

| Decision | Choice |
| --- | --- |
| Who may book | New admin-managed email allowlist (`StudioBooker`), separate from staff roles |
| Booking unit | A date + start time + end time (flexible length); overlaps rejected |
| Booking flow | Instant self-service (no approval) |
| Booker self-service | Cancel **and** edit their own upcoming bookings |
| Studio hours | 24 hours — any time of day, overnight allowed |
| Timezone | Europe/London (UK), DST-correct |
| Primary calendar view | Week time-grid (Google-Calendar style) + month mini-picker |
| Admin studio page | Owner-only (like `/admin/settings`) |
| Payment | None (free for now) |

Defaults chosen (all tunable constants, no code-structure impact to change):
minimum booking 30 minutes, booking horizon 180 days ahead, cannot book the past,
soft-cancel (row kept as `cancelled`, slot freed).

## Access & gating architecture

Everyone authenticates with Google via the existing NextAuth setup. "Allowed to
book" is a **new email allowlist**, chosen over a flag on the `User` record
because a `User` row only exists after a person's first login — the allowlist lets
the owner **pre-authorise an email before that person has ever logged in**.

**Gating is enforced at the page and API level, never in `middleware.ts`.**
`middleware.ts` runs at the edge with no database access; it can only read claims
frozen into the 30-day login token. A freshly-added (or freshly-removed) booker
would not be reflected there until they logged in again. Checking the allowlist in
the server component (page) and in each API handler makes **both add and remove
take effect on the user's next request** — the same revocation-aware principle the
codebase already applies in `lib/auth-guard.ts`.

- `/studio` (booker-facing) is **not** added to the middleware auth block. It's a
  dynamic server component that checks the session and allowlist itself. It
  receives the normal relaxed CSP.
- `/admin/studio` (owner-facing) **is** gated by middleware as owner-only — add
  `if (pathname.startsWith("/admin/studio")) return "owner";` to
  `requiredForAdminPath` in `middleware.ts` — and re-checked in its API handlers
  with `requireAdmin`.

A not-signed-in visitor to `/studio` is redirected to
`/login?callbackUrl=/studio` (the existing login flow already honours
`callbackUrl`).

## Data model (Prisma — two new models)

```prisma
/// Studio-booking allowlist. An email may be added before that person has ever
/// logged in; access is checked by email at request time (revocation-aware).
model StudioBooker {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique   // stored lowercased
  name      String?            // optional admin-set label
  note      String?            // optional admin note (e.g. "session drummer")
  addedById String?  @db.ObjectId  // Mongo User.id of the owner who added them
  createdAt DateTime @default(now())

  @@index([email])
}

/// One booked studio session. `start`/`end` are absolute UTC instants; they are
/// entered and displayed in the studio timezone (Europe/London) and converted at
/// the boundary. A confirmed booking may not overlap another confirmed booking.
model StudioBooking {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  // Who booked. bookerEmail is denormalized (survives User changes and matches the
  // allowlist model). userId is the real Mongo User.id (resolved by email via
  // resolveUserId, NOT token.sub) when the booker has a User row.
  userId      String?  @db.ObjectId
  bookerEmail String
  bookerName  String?
  start       DateTime
  end         DateTime
  title       String?  // optional session label, e.g. "Vocal tracking"
  notes       String?  // private to the booker + owner
  status      String   @default("confirmed") // "confirmed" | "cancelled"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([start])
  @@index([start, end])
  @@index([status, start])
  @@index([userId])
}
```

Overlap rule: two intervals `[aStart, aEnd)` and `[bStart, bEnd)` overlap iff
`aStart < bEnd && bStart < aEnd`. Touching intervals (one ends exactly when the
next begins) do **not** overlap, so back-to-back bookings are allowed. Only
`confirmed` bookings are considered when checking conflicts.

## Timezone + validation logic — `lib/studio-schedule.ts` (pure, unit-tested)

A dependency-free module (no date library is installed, matching the repo's
existing `dayKeyUtc` approach). Responsibilities:

- `STUDIO_TZ = "Europe/London"` and tunable constants: `MIN_MINUTES = 30`,
  `HORIZON_DAYS = 180`.
- Convert a UK wall-clock date+time to a UTC instant and back, DST-correct, using
  `Intl.DateTimeFormat` to read the zone's offset at a given instant (the standard
  "format a guess, measure the delta" technique). No external dependency.
- `formatInStudioTz(date, opts)` for display.
- `bookingsOverlap(aStart, aEnd, bStart, bEnd)`.
- `validateBookingInput({ dateKey, startHM, endHM })` → normalized
  `{ start, end }` UTC instants or a specific error. Rules: valid times,
  `end > start`, at least `MIN_MINUTES`, not in the past, within `HORIZON_DAYS`.

This module is written **test-first** (Vitest is already set up). Test cases must
include: a spring-forward (late-March) and autumn (late-October) London DST
boundary; touching intervals not counting as overlap; a booking that starts before
and ends after an existing one; and the validation rules (past, too short, beyond
horizon).

## API routes

All follow the repo's hard rules: `export const dynamic = "force-dynamic"` +
`runtime = "nodejs"`, logic wrapped in try/catch, the correct guard at the top,
and `recordAudit(req, guard.token, {...})` on writes. A new guard helper is added
to `lib/auth-guard.ts`:

```ts
// Owner (bootstrap email or DB role "admin") OR an email present in StudioBooker.
// DB-backed, revocation-aware, fails closed on a DB error. Mirrors requireStaff.
export async function requireStudioAccess(req: NextRequest): Promise<Guard>
```

Booker-facing (guard: `requireStudioAccess`):

- `GET  /api/studio/bookings?from=&to=` — confirmed bookings in a range, for the
  calendar. Each item flags whether it belongs to the caller; `notes` are included
  only for the caller's own bookings and for owners.
- `POST /api/studio/bookings` — create. Validates input via
  `validateBookingInput`, then **re-checks overlap against confirmed bookings
  immediately before insert** (the browser's view can be stale). Resolves the real
  `userId` with `resolveUserId()`. Audited.
- `PATCH  /api/studio/bookings/[id]` — edit time/title/notes. Allowed if the caller
  is the booking's owner (by userId/email) or an owner; the booking must be
  upcoming; overlap re-checked. Audited.
- `DELETE /api/studio/bookings/[id]` — soft-cancel (`status = "cancelled"`).
  Booking owner (upcoming only) or owner. Audited.

Owner-facing (guard: `requireAdmin`):

- `GET  /api/studio/bookers` — list the allowlist.
- `POST /api/studio/bookers` — add an email (lowercased, deduped). Audited.
- `DELETE /api/studio/bookers/[id]` — remove from the allowlist. Audited.

Cross-origin writes are additionally protected with `isSameOrigin(req)` per the
existing pattern for destructive cookie-authenticated routes.

## Pages & components

Booker-facing:

- `app/studio/page.tsx` — server component (`force-dynamic`, `nodejs`). Gets the
  session; redirects signed-out visitors to `/login?callbackUrl=/studio`. Checks
  studio access (owner or allowlisted) via Prisma. If not allowed, renders a
  friendly "you're not on the studio access list yet — contact the label" screen.
  If allowed, renders `<StudioBookingClient>` with the current week's bookings.
- `app/studio/StudioBookingClient.tsx` — client component: the week time-grid, the
  month mini-picker, the booking dialog (Radix `Dialog`), a "My bookings" panel,
  and cancel/edit actions. Uses the existing `Button` and `Toast`.
- `components/studio/WeekGrid.tsx` — the visual week view: 7 day columns × 24-hour
  axis, confirmed bookings drawn as positioned coloured blocks, free areas
  clickable to start a booking. Styled to match `app/admin/calendar`.

Owner-facing:

- `app/admin/studio/page.tsx` (+ client) — uses the admin shell (`PageHeader`).
  Two sections: the **allowlist manager** (add/remove emails with optional
  name/note) and an **all-bookings** view (the same calendar plus a list) where the
  owner can cancel any booking. A "Studio" entry is added to the admin sidebar
  (owner-only).

## Visibility between bookers

On the shared calendar, allowed users see a booked block's **name + title**
(e.g. "Ada — Vocal tracking") so the schedule is legible. Private **`notes`** are
returned/shown only to the booking's own booker and to owners. (Change point: if
preferred, blocks can instead show a bare "Booked" with no name — a one-line change
in the GET serializer and the block renderer.)

## Concurrency note

MongoDB has no interval-exclusion constraint, so creation does a check-then-insert:
validate → query confirmed bookings overlapping the requested range → insert if
none. There is a small time-of-check/time-of-use window in which two simultaneous
requests could both pass. For a single free studio with a small trusted allowlist
this is acceptable; it is documented here and can later be tightened (e.g. a
short-lived lock or a compound guard) if double-bookings ever actually occur.

## Testing

- **Unit (Vitest, written first):** `lib/studio-schedule.ts` — DST conversions,
  overlap edge cases, and all validation rules (see the module section).
- **Flow:** drive create → overlap-rejected → cancel-frees-slot → edit end-to-end,
  plus an allowlist add/remove gating both `/studio` and its API.
- ⚠️ **The local `.env` points at LIVE production Mongo and S3.** Any booking or
  allowlist row created while testing is a real production row. Logic tests stay
  off the database; any live smoke-test rows created through the UI/API are deleted
  afterwards. This risk is called out so nothing test-related lingers in prod.

## Out of scope (v1)

- Payment / pricing (explicitly free for now).
- Email/SMS notifications on booking or cancellation.
- Multiple studios/rooms (single studio assumed — "the studio").
- Recurring bookings.
- Public visibility of the schedule (allowlist-only).

## File inventory (new / changed)

New:

- `prisma/schema.prisma` — add `StudioBooker`, `StudioBooking` (change).
- `lib/studio-schedule.ts` + `lib/studio-schedule.test.ts`
- `app/studio/page.tsx`, `app/studio/StudioBookingClient.tsx`
- `components/studio/WeekGrid.tsx` (+ any small sub-components)
- `app/admin/studio/page.tsx` (+ client)
- `app/api/studio/bookings/route.ts`, `app/api/studio/bookings/[id]/route.ts`
- `app/api/studio/bookers/route.ts`, `app/api/studio/bookers/[id]/route.ts`

Changed:

- `lib/auth-guard.ts` — add `requireStudioAccess`.
- `middleware.ts` — add `/admin/studio` → owner in `requiredForAdminPath`.
- Admin sidebar nav — add owner-only "Studio" entry.
