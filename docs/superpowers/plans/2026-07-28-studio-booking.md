# Studio Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an access-controlled studio booking area where allowlisted, Google-signed-in people book studio sessions on a visual week calendar, and the owner manages the allowlist.

**Architecture:** Two new Prisma models (`StudioBooker` allowlist, `StudioBooking` sessions). Access is gated in the server component and in each API handler against the DB allowlist (never in edge `middleware.ts`, which can't read the DB), so add/remove take effect on the next request. Booking times are stored as UTC instants and entered/displayed in Europe/London. A pure, unit-tested `lib/studio-schedule.ts` owns all timezone conversion, overlap and validation logic; a pure `lib/studio-view.ts` owns the calendar-layout math. The UI is a client orchestrator composing dumb presentational components (`WeekGrid`, `BookingDialog`, `MyBookings`).

**Tech Stack:** Next.js 15 (App Router, `force-dynamic` route handlers), React 19, TypeScript, Prisma 6 + MongoDB, NextAuth v4 (Google), Tailwind v4, Radix Dialog, Vitest.

## Global Constraints

Copied verbatim from `CLAUDE.md` and the spec — every task implicitly includes these:

- **Every mutating API route MUST guard itself** at the top of the handler and return the guard response on failure. Family: `requireAdmin` / `requireStaff` / `requirePermission` / `requireUser` / (new) `requireStudioAccess`, plus `isSameOrigin` for CSRF. `middleware.ts` only protects pages, not API routes.
- Routes set `export const dynamic = "force-dynamic"` + `export const runtime = "nodejs"`, wrap logic in try/catch, and audit writes via `recordAudit(req, guard.token, {...})`.
- **Resolve real user IDs with `resolveUserId()`** — `token.sub` is the Google OAuth subject, not the Mongo `User.id`.
- **The local `.env` points at LIVE production MongoDB and S3.** Any booking or allowlist row created while testing is a real production row. Keep logic tests off the DB; delete any live smoke-test rows afterward.
- **Never `next build` while the dev server runs.** Verify with `tsc`, `lint`, `test` — not `build`.
- **Never run `npm run db:push` or `npm run db:deploy` casually** — they hit prod. Local work uses `npm run db:generate` only (client types). MongoDB auto-creates collections on first write; the new indexes are created on prod at the gated deploy step, not during development.
- **Never `git add -A`.** Stage explicit paths. `--literal-pathspecs` is a top-level git option (before the subcommand) for `[id]` bracket paths.
- **Do not push or deploy without explicit approval.**
- Timezone constant: `Europe/London`. Studio hours: 24h. Booking flow: instant, no approval, free.

---

## File Structure

New files:

- `lib/studio-schedule.ts` — pure timezone/overlap/validation logic (server + client safe).
- `lib/studio-schedule.test.ts` — Vitest unit tests for the above.
- `lib/studio-view.ts` — pure calendar-layout helpers (week days, booking→day-segment).
- `lib/studio-view.test.ts` — Vitest unit tests for the above.
- `app/api/studio/bookings/route.ts` — `GET` (list range) + `POST` (create).
- `app/api/studio/bookings/[id]/route.ts` — `PATCH` (edit) + `DELETE` (cancel).
- `app/api/studio/bookers/route.ts` — `GET` (list) + `POST` (add) allowlist, owner-only.
- `app/api/studio/bookers/[id]/route.ts` — `DELETE` (remove) allowlist, owner-only.
- `app/studio/layout.tsx` — mounts `ToastProvider` for the booker page.
- `app/studio/page.tsx` — gated server component; renders access-denied screen or the client.
- `app/studio/StudioBookingClient.tsx` — client orchestrator (state, fetch, handlers).
- `components/studio/WeekGrid.tsx` — presentational week time-grid.
- `components/studio/BookingDialog.tsx` — create/edit dialog.
- `components/studio/MyBookings.tsx` — caller's own bookings list with cancel/edit.
- `app/admin/studio/page.tsx` — owner-only admin page (server component).
- `app/admin/studio/StudioAdminClient.tsx` — allowlist manager + all-bookings list.

Modified files:

- `prisma/schema.prisma` — add `StudioBooker`, `StudioBooking`.
- `lib/auth-guard.ts` — add `requireStudioAccess`.
- `lib/page-guard.ts` — add `requirePageOwner` and `studioPageAccess`.
- `middleware.ts` — add `/admin/studio` → owner in `requiredForAdminPath`.
- `components/admin/shell/AdminSidebar.tsx` — add owner-only "Studio" nav link.

---

## Task 1: Prisma models

**Files:**
- Modify: `prisma/schema.prisma` (append two models after the existing models)

**Interfaces:**
- Produces: Prisma models `StudioBooker { id, email(unique), name?, note?, addedById?, createdAt }` and `StudioBooking { id, userId?, bookerEmail, bookerName?, start, end, title?, notes?, status, createdAt, updatedAt }`. Prisma client accessors `prisma.studioBooker` and `prisma.studioBooking`.

- [ ] **Step 1: Add the models**

Append to `prisma/schema.prisma`:

```prisma
/// Studio-booking allowlist. An email may be added before that person has ever
/// logged in; access is checked by email at request time (revocation-aware).
model StudioBooker {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  email     String   @unique // stored lowercased
  name      String?
  note      String?
  addedById String?  @db.ObjectId
  createdAt DateTime @default(now())

  @@index([email])
}

/// One booked studio session. `start`/`end` are absolute UTC instants; entered and
/// displayed in the studio timezone (Europe/London) and converted at the boundary.
/// A confirmed booking may not overlap another confirmed booking.
model StudioBooking {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String?  @db.ObjectId
  bookerEmail String
  bookerName  String?
  start       DateTime
  end         DateTime
  title       String?
  notes       String?
  status      String   @default("confirmed") // "confirmed" | "cancelled"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([start])
  @@index([start, end])
  @@index([status, start])
  @@index([userId])
}
```

- [ ] **Step 2: Regenerate the Prisma client (local, safe)**

Run: `npm run db:generate`
Expected: `Generated Prisma Client` success. Do NOT run `db:push`/`db:deploy` (prod).

- [ ] **Step 3: Verify the client typechecks the new models**

Run: `npx tsc --noEmit`
Expected: no errors (a scratch reference like `prisma.studioBooking` now resolves; nothing else changed yet).

- [ ] **Step 4: Commit**

```bash
git --literal-pathspecs add prisma/schema.prisma
git commit -m "feat(studio): add StudioBooker + StudioBooking models"
```

---

## Task 2: Schedule logic (`lib/studio-schedule.ts`) — TDD

**Files:**
- Create: `lib/studio-schedule.ts`
- Test: `lib/studio-schedule.test.ts`

**Interfaces:**
- Produces:
  - `STUDIO_TZ = "Europe/London"`, `MIN_MINUTES = 30`, `MAX_MINUTES = 1440`, `HORIZON_DAYS = 180`
  - `zonedWallTimeToUtc(dateKey: string, timeHM: string): Date`
  - `studioParts(utc: Date): { year:number; month:number; day:number; hour:number; minute:number }`
  - `minutesIntoStudioDay(utc: Date): number` (0–1439)
  - `studioDayStartUtc(dateKey: string): Date`
  - `formatStudioTime(utc: Date): string` and `formatStudioDate(utc: Date): string`
  - `bookingsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean`
  - `type BookingTimeInput = { startDate: string; startTime: string; endDate: string; endTime: string }`
  - `type ValidatedBooking = { ok: true; start: Date; end: Date } | { ok: false; error: string }`
  - `validateBookingInput(input: BookingTimeInput, now?: Date): ValidatedBooking`

- [ ] **Step 1: Write the failing tests**

Create `lib/studio-schedule.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  zonedWallTimeToUtc,
  studioParts,
  minutesIntoStudioDay,
  bookingsOverlap,
  validateBookingInput,
} from "./studio-schedule";

describe("zonedWallTimeToUtc", () => {
  it("maps a winter (GMT) wall time to the same UTC hour", () => {
    // 2026-01-15 is GMT (offset 0).
    expect(zonedWallTimeToUtc("2026-01-15", "12:00").toISOString()).toBe(
      "2026-01-15T12:00:00.000Z"
    );
  });
  it("maps a summer (BST, +1) wall time back one hour to UTC", () => {
    // 2026-07-15 is BST (offset +60).
    expect(zonedWallTimeToUtc("2026-07-15", "12:00").toISOString()).toBe(
      "2026-07-15T11:00:00.000Z"
    );
  });
  it("resolves a time just after the spring-forward gap", () => {
    // BST begins 2026-03-29 01:00→02:00. 03:00 local exists and is BST (+1).
    expect(zonedWallTimeToUtc("2026-03-29", "03:00").toISOString()).toBe(
      "2026-03-29T02:00:00.000Z"
    );
  });
});

describe("studioParts / minutesIntoStudioDay", () => {
  it("reads back local noon from a BST instant", () => {
    const p = studioParts(new Date("2026-07-15T11:00:00.000Z"));
    expect(p.hour).toBe(12);
    expect(p.minute).toBe(0);
  });
  it("minutesIntoStudioDay is 720 at local noon in summer", () => {
    expect(minutesIntoStudioDay(new Date("2026-07-15T11:00:00.000Z"))).toBe(720);
  });
});

describe("bookingsOverlap", () => {
  const d = (s: string) => new Date(s);
  it("touching intervals do not overlap (back-to-back allowed)", () => {
    expect(
      bookingsOverlap(
        d("2026-07-15T10:00:00Z"), d("2026-07-15T12:00:00Z"),
        d("2026-07-15T12:00:00Z"), d("2026-07-15T13:00:00Z"),
      )
    ).toBe(false);
  });
  it("partial overlap is detected", () => {
    expect(
      bookingsOverlap(
        d("2026-07-15T10:00:00Z"), d("2026-07-15T12:00:00Z"),
        d("2026-07-15T11:00:00Z"), d("2026-07-15T11:30:00Z"),
      )
    ).toBe(true);
  });
  it("an enveloping interval overlaps", () => {
    expect(
      bookingsOverlap(
        d("2026-07-15T10:00:00Z"), d("2026-07-15T12:00:00Z"),
        d("2026-07-15T09:00:00Z"), d("2026-07-15T13:00:00Z"),
      )
    ).toBe(true);
  });
});

describe("validateBookingInput", () => {
  const now = new Date("2026-07-15T09:00:00.000Z"); // 10:00 BST
  const base = { startDate: "2026-07-16", startTime: "14:00", endDate: "2026-07-16", endTime: "16:00" };
  it("accepts a valid future booking", () => {
    const r = validateBookingInput(base, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.start.toISOString()).toBe("2026-07-16T13:00:00.000Z");
      expect(r.end.toISOString()).toBe("2026-07-16T15:00:00.000Z");
    }
  });
  it("rejects end <= start", () => {
    const r = validateBookingInput({ ...base, endTime: "14:00" }, now);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("after") });
  });
  it("rejects a booking shorter than the minimum", () => {
    const r = validateBookingInput({ ...base, endTime: "14:15" }, now);
    expect(r.ok).toBe(false);
  });
  it("rejects a booking in the past", () => {
    const r = validateBookingInput(
      { startDate: "2026-07-14", startTime: "14:00", endDate: "2026-07-14", endTime: "16:00" },
      now
    );
    expect(r.ok).toBe(false);
  });
  it("rejects a booking beyond the horizon", () => {
    const r = validateBookingInput(
      { startDate: "2027-06-01", startTime: "14:00", endDate: "2027-06-01", endTime: "16:00" },
      now
    );
    expect(r.ok).toBe(false);
  });
  it("rejects malformed input", () => {
    const r = validateBookingInput({ startDate: "nope", startTime: "14:00", endDate: "2026-07-16", endTime: "16:00" }, now);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- studio-schedule`
Expected: FAIL — `studio-schedule` module not found / exports undefined.

- [ ] **Step 3: Implement `lib/studio-schedule.ts`**

Create `lib/studio-schedule.ts`:

```ts
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
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function parseHM(s: string): { h: number; mi: number } | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
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
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour % 24, map.minute, map.second);
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
  return { year: +map.year, month: +map.month, day: +map.day, hour: (+map.hour) % 24, minute: +map.minute };
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- studio-schedule`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add lib/studio-schedule.ts lib/studio-schedule.test.ts
git commit -m "feat(studio): pure timezone/overlap/validation logic (tested)"
```

---

## Task 3: View-layout logic (`lib/studio-view.ts`) — TDD

**Files:**
- Create: `lib/studio-view.ts`
- Test: `lib/studio-view.test.ts`

**Interfaces:**
- Consumes: `studioParts`, `studioDayStartUtc`, `minutesIntoStudioDay` from `lib/studio-schedule`.
- Produces:
  - `type DayColumn = { dateKey: string; startUtc: Date; isToday: boolean }`
  - `weekDays(anchor: Date, now?: Date): DayColumn[]` — 7 columns, Monday-first, for the STUDIO_TZ week containing `anchor`.
  - `addDaysKey(dateKey: string, days: number): string`
  - `type Segment = { topMin: number; bottomMin: number }`
  - `segmentForDay(bStart: Date, bEnd: Date, day: DayColumn, nextDayStartUtc: Date): Segment | null` — the booking's vertical span within that day (0–1440), or null if it doesn't intersect.

- [ ] **Step 1: Write the failing tests**

Create `lib/studio-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { weekDays, addDaysKey, segmentForDay } from "./studio-view";
import { studioDayStartUtc } from "./studio-schedule";

describe("weekDays", () => {
  it("returns 7 Monday-first days containing the anchor", () => {
    // 2026-07-15 is a Wednesday.
    const days = weekDays(new Date("2026-07-15T12:00:00Z"));
    expect(days).toHaveLength(7);
    expect(days[0].dateKey).toBe("2026-07-13"); // Monday
    expect(days[6].dateKey).toBe("2026-07-19"); // Sunday
  });
});

describe("addDaysKey", () => {
  it("advances a day key across a month boundary", () => {
    expect(addDaysKey("2026-07-31", 1)).toBe("2026-08-01");
  });
});

describe("segmentForDay", () => {
  const day = { dateKey: "2026-07-15", startUtc: studioDayStartUtc("2026-07-15"), isToday: false };
  const next = studioDayStartUtc("2026-07-16");
  it("maps a same-day booking to its local-minute span", () => {
    // 14:00–16:00 BST = 13:00–15:00 UTC.
    const seg = segmentForDay(
      new Date("2026-07-15T13:00:00Z"), new Date("2026-07-15T15:00:00Z"), day, next
    );
    expect(seg).toEqual({ topMin: 840, bottomMin: 960 });
  });
  it("returns null for a booking on another day", () => {
    const seg = segmentForDay(
      new Date("2026-07-16T13:00:00Z"), new Date("2026-07-16T15:00:00Z"), day, next
    );
    expect(seg).toBeNull();
  });
  it("clamps an overnight booking to end-of-day", () => {
    // 23:00 local → 02:00 next day local; within THIS day it runs to 1440.
    const seg = segmentForDay(
      new Date("2026-07-15T22:00:00Z"), new Date("2026-07-16T01:00:00Z"), day, next
    );
    expect(seg?.topMin).toBe(1380); // 23:00
    expect(seg?.bottomMin).toBe(1440);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- studio-view`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/studio-view.ts`**

Create `lib/studio-view.ts`:

```ts
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
  const [y, m, d] = dateKey.split("-").map(Number);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- studio-view`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add lib/studio-view.ts lib/studio-view.test.ts
git commit -m "feat(studio): pure week-grid layout helpers (tested)"
```

---

## Task 4: Access guards + middleware

**Files:**
- Modify: `lib/auth-guard.ts` (add `requireStudioAccess`)
- Modify: `lib/page-guard.ts` (add `requirePageOwner`, `studioPageAccess`)
- Modify: `middleware.ts` (add `/admin/studio` → owner)

**Interfaces:**
- Consumes: `tokenIsOwner` (module-local in auth-guard.ts), `prisma`, `isAdminEmail`, `getServerSession`, `authOptions`.
- Produces:
  - `requireStudioAccess(req: NextRequest): Promise<Guard>` — owner OR allowlisted email; DB-backed, fails closed.
  - `requirePageOwner(): Promise<void>` — redirects non-owners; owners return.
  - `studioPageAccess(): Promise<"ok" | "denied">` — redirects unauthenticated to `/login?callbackUrl=/studio`; returns "ok" for owner/allowlisted, "denied" otherwise.

- [ ] **Step 1: Add `requireStudioAccess` to `lib/auth-guard.ts`**

Append (after `requireUser`, before `isSameOrigin`):

```ts
/**
 * Authoritative STUDIO-BOOKING access check. Owners (bootstrap email or DB role
 * "admin") always pass. Everyone else must have their email on the StudioBooker
 * allowlist — read fresh from the DB on every call, so adding/removing a booker
 * takes effect on their next request. Fails closed if the DB can't be read.
 */
export async function requireStudioAccess(req: NextRequest): Promise<Guard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  if (!token?.email) return forbidden();
  if (await tokenIsOwner(token)) return { ok: true, token };
  try {
    const booker = await prisma.studioBooker.findUnique({
      where: { email: (token.email as string).toLowerCase() },
      select: { id: true },
    });
    if (booker) return { ok: true, token };
  } catch (e) {
    console.error("requireStudioAccess: allowlist lookup failed", e);
  }
  return forbidden();
}
```

- [ ] **Step 2: Add page guards to `lib/page-guard.ts`**

Append at the end of `lib/page-guard.ts`:

```ts
/**
 * Owner-only page gate (bootstrap email or DB role "admin"). Redirects to /login
 * when unauthenticated, or /admin when signed in but not an owner. Fails closed.
 */
export async function requirePageOwner(): Promise<void> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/login");
  if (isAdminEmail(email)) return;
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (user?.role === "admin") return;
  } catch (e) {
    console.error("requirePageOwner: role lookup failed", e);
  }
  redirect("/admin");
}

/**
 * Studio booker page access. Redirects unauthenticated visitors to the login
 * page (returning to /studio). Returns "ok" for owners and allowlisted emails,
 * "denied" otherwise — so the page can render a friendly access screen rather
 * than redirect. Fails closed (a DB error → "denied").
 */
export async function studioPageAccess(): Promise<"ok" | "denied"> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/login?callbackUrl=/studio");
  if (isAdminEmail(email)) return "ok";
  try {
    const [user, booker] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { role: true } }),
      prisma.studioBooker.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } }),
    ]);
    if (user?.role === "admin" || booker) return "ok";
  } catch (e) {
    console.error("studioPageAccess: lookup failed", e);
  }
  return "denied";
}
```

- [ ] **Step 3: Gate `/admin/studio` in `middleware.ts`**

In `requiredForAdminPath`, add alongside the other owner-only entries (right after the `/admin/audit` line):

```ts
  if (pathname.startsWith("/admin/studio")) return "owner";
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add lib/auth-guard.ts lib/page-guard.ts middleware.ts
git commit -m "feat(studio): studio-access API guard, owner page guard, admin gating"
```

---

## Task 5: Bookings API — list + create

**Files:**
- Create: `app/api/studio/bookings/route.ts`

**Interfaces:**
- Consumes: `requireStudioAccess`, `isAdminRequest`, `isSameOrigin` (auth-guard), `resolveUserId` (current-user), `recordAudit` (audit), `validateBookingInput`, `bookingsOverlap` (studio-schedule), `prisma`.
- Produces: `GET /api/studio/bookings?from=<ISO>&to=<ISO>` → `{ bookings: BookingDTO[] }`; `POST` → `{ booking: BookingDTO }` (201). `BookingDTO = { id, start, end, title, bookerName, mine, notes }` (`notes` non-null only when `mine` or owner).

- [ ] **Step 1: Implement the route**

Create `app/api/studio/bookings/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioAccess, isAdminRequest, isSameOrigin } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";
import { recordAudit } from "@/lib/audit";
import { validateBookingInput, bookingsOverlap, formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingDTO = {
  id: string; start: string; end: string;
  title: string | null; bookerName: string | null; mine: boolean; notes: string | null;
};

function parseRange(req: NextRequest): { from: Date; to: Date } {
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : new Date(Date.now() - 7 * 864e5);
  const to = toRaw ? new Date(toRaw) : new Date(Date.now() + 60 * 864e5);
  const valid = !isNaN(from.getTime()) && !isNaN(to.getTime());
  return valid ? { from, to } : { from: new Date(Date.now() - 7 * 864e5), to: new Date(Date.now() + 60 * 864e5) };
}

// GET /api/studio/bookings?from&to — confirmed bookings intersecting [from,to].
export async function GET(request: NextRequest) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  try {
    const email = (guard.token.email as string).toLowerCase();
    const owner = await isAdminRequest(request);
    const { from, to } = parseRange(request);
    const rows = await prisma.studioBooking.findMany({
      where: { status: "confirmed", start: { lt: to }, end: { gt: from } },
      orderBy: { start: "asc" },
    });
    const bookings: BookingDTO[] = rows.map((b) => {
      const mine = b.bookerEmail.toLowerCase() === email;
      return {
        id: b.id,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        title: b.title,
        bookerName: b.bookerName,
        mine,
        notes: mine || owner ? b.notes : null,
      };
    });
    return NextResponse.json({ bookings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("studio bookings GET error:", e);
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 });
  }
}

// POST /api/studio/bookings — create a booking (instant, no approval).
export async function POST(request: NextRequest) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const validated = validateBookingInput({
      startDate: String(o.startDate ?? ""),
      startTime: String(o.startTime ?? ""),
      endDate: String(o.endDate ?? ""),
      endTime: String(o.endTime ?? ""),
    });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const { start, end } = validated;

    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 200) : null;
    const notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 2000) : null;

    // Authoritative overlap check immediately before insert (browser view can be
    // stale). Only confirmed bookings that intersect the requested window matter.
    const clashers = await prisma.studioBooking.findMany({
      where: { status: "confirmed", start: { lt: end }, end: { gt: start } },
      select: { start: true, end: true },
    });
    const clash = clashers.some((c) => bookingsOverlap(start, end, c.start, c.end));
    if (clash) {
      return NextResponse.json({ error: "That time overlaps an existing booking." }, { status: 409 });
    }

    const email = (guard.token.email as string).toLowerCase();
    const userId = await resolveUserId(guard.token);
    const bookerName = (typeof guard.token.name === "string" ? guard.token.name : null);
    const booking = await prisma.studioBooking.create({
      data: { userId, bookerEmail: email, bookerName, start, end, title, notes, status: "confirmed" },
    });

    await recordAudit(request, guard.token, {
      action: "create",
      resource: "studio_booking",
      resourceId: booking.id,
      summary: `Booked studio ${formatStudioDate(start)} ${formatStudioTime(start)}–${formatStudioTime(end)}`,
    });

    const dto: BookingDTO = {
      id: booking.id, start: booking.start.toISOString(), end: booking.end.toISOString(),
      title: booking.title, bookerName: booking.bookerName, mine: true, notes: booking.notes,
    };
    return NextResponse.json({ booking: dto }, { status: 201 });
  } catch (e) {
    console.error("studio bookings POST error:", e);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Add `studio_booking` to the audit resource list**

In `lib/audit.ts`, add `"studio_booking"` to the `AUDIT_RESOURCES` array (keeps the audit-log filter in sync):

```ts
  "demo", "digest", "error", "message", "pitch", "placement", "press",
  "release", "settings", "studio_booking", "subscriber", "task", "template", "track", "user",
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`guard.token.name` is typed via JWT; if TS complains, cast `guard.token.name as string | undefined`.)

- [ ] **Step 4: Commit**

```bash
git --literal-pathspecs add app/api/studio/bookings/route.ts lib/audit.ts
git commit -m "feat(studio): bookings list + create API with overlap guard"
```

---

## Task 6: Bookings API — edit + cancel own

**Files:**
- Create: `app/api/studio/bookings/[id]/route.ts`

**Interfaces:**
- Consumes: `requireStudioAccess`, `isAdminRequest`, `isSameOrigin`, `recordAudit`, `validateBookingInput`, `bookingsOverlap`, `prisma`.
- Produces: `PATCH /api/studio/bookings/[id]` (edit time/title/notes of an upcoming booking you own, or any as owner) → `{ booking }`; `DELETE /api/studio/bookings/[id]` (soft-cancel) → `{ ok: true }`.

- [ ] **Step 1: Implement the route**

Create `app/api/studio/bookings/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioAccess, isAdminRequest, isSameOrigin } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { validateBookingInput, bookingsOverlap, formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// True if the caller may modify this booking: an owner, OR the booking's own
// booker AND the booking is still upcoming (can't touch a past session).
function canModify(bookerEmail: string, callerEmail: string, start: Date, owner: boolean): { ok: boolean; error?: string; status?: number } {
  if (owner) return { ok: true };
  if (bookerEmail.toLowerCase() !== callerEmail.toLowerCase()) return { ok: false, error: "Forbidden", status: 403 };
  if (start.getTime() <= Date.now()) return { ok: false, error: "That booking has already started.", status: 400 };
  return { ok: true };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.studioBooking.findUnique({ where: { id } });
    if (!existing || existing.status === "cancelled") return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const callerEmail = guard.token.email as string;
    const owner = await isAdminRequest(request);
    const gate = canModify(existing.bookerEmail, callerEmail, existing.start, owner);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    // Time change: all four fields must be present together and re-validated.
    if ("startDate" in o || "startTime" in o || "endDate" in o || "endTime" in o) {
      const validated = validateBookingInput({
        startDate: String(o.startDate ?? ""), startTime: String(o.startTime ?? ""),
        endDate: String(o.endDate ?? ""), endTime: String(o.endTime ?? ""),
      });
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
      const { start, end } = validated;
      const clashers = await prisma.studioBooking.findMany({
        where: { status: "confirmed", id: { not: id }, start: { lt: end }, end: { gt: start } },
        select: { start: true, end: true },
      });
      if (clashers.some((c) => bookingsOverlap(start, end, c.start, c.end))) {
        return NextResponse.json({ error: "That time overlaps an existing booking." }, { status: 409 });
      }
      data.start = start; data.end = end;
    }
    if ("title" in o) data.title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 200) : null;
    if ("notes" in o) data.notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 2000) : null;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No changes." }, { status: 400 });

    const booking = await prisma.studioBooking.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update", resource: "studio_booking", resourceId: id,
      summary: `Updated studio booking ${formatStudioDate(booking.start)} ${formatStudioTime(booking.start)}–${formatStudioTime(booking.end)}`,
    });
    return NextResponse.json({ booking: { id: booking.id, start: booking.start.toISOString(), end: booking.end.toISOString(), title: booking.title, bookerName: booking.bookerName, mine: true, notes: booking.notes } });
  } catch (e) {
    console.error("studio booking PATCH error:", e);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.studioBooking.findUnique({ where: { id } });
    if (!existing || existing.status === "cancelled") return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const callerEmail = guard.token.email as string;
    const owner = await isAdminRequest(request);
    const gate = canModify(existing.bookerEmail, callerEmail, existing.start, owner);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    await prisma.studioBooking.update({ where: { id }, data: { status: "cancelled" } });
    await recordAudit(request, guard.token, {
      action: "delete", resource: "studio_booking", resourceId: id,
      summary: `Cancelled studio booking ${formatStudioDate(existing.start)} ${formatStudioTime(existing.start)}–${formatStudioTime(existing.end)}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("studio booking DELETE error:", e);
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git --literal-pathspecs add "app/api/studio/bookings/[id]/route.ts"
git commit -m "feat(studio): edit + cancel own booking API"
```

---

## Task 7: Allowlist (bookers) API — owner-only

**Files:**
- Create: `app/api/studio/bookers/route.ts`
- Create: `app/api/studio/bookers/[id]/route.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `isSameOrigin`, `resolveUserId`, `recordAudit`, `prisma`.
- Produces: `GET /api/studio/bookers` → `{ bookers: {id,email,name,note,createdAt}[] }`; `POST` (add email) → `{ booker }`; `DELETE /api/studio/bookers/[id]` → `{ ok: true }`.

- [ ] **Step 1: Implement the list + add route**

Create `app/api/studio/bookers/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSameOrigin } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const bookers = await prisma.studioBooker.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ bookers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("studio bookers GET error:", e);
    return NextResponse.json({ error: "Failed to load allowlist" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 120) : null;
    const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 500) : null;

    const existing = await prisma.studioBooker.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "That email is already on the list." }, { status: 409 });

    const addedById = await resolveUserId(guard.token);
    const booker = await prisma.studioBooker.create({ data: { email, name, note, addedById } });
    await recordAudit(request, guard.token, {
      action: "create", resource: "studio_booker", resourceId: booker.id,
      summary: `Granted studio booking access to ${email}`,
    });
    return NextResponse.json({ booker }, { status: 201 });
  } catch (e) {
    console.error("studio bookers POST error:", e);
    return NextResponse.json({ error: "Failed to add to allowlist" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement the remove route**

Create `app/api/studio/bookers/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSameOrigin } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.studioBooker.findUnique({ where: { id }, select: { email: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.studioBooker.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete", resource: "studio_booker", resourceId: id,
      summary: `Revoked studio booking access from ${existing.email}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("studio booker DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove from allowlist" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add `studio_booker` to the audit resource list**

In `lib/audit.ts` `AUDIT_RESOURCES`, add `"studio_booker"` next to `"studio_booking"`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add app/api/studio/bookers/route.ts "app/api/studio/bookers/[id]/route.ts" lib/audit.ts
git commit -m "feat(studio): owner-only allowlist (bookers) API"
```

---

## Task 8: Booker page — gating, layout, access-denied screen, client shell

**Files:**
- Create: `app/studio/layout.tsx`
- Create: `app/studio/page.tsx`
- Create: `app/studio/StudioBookingClient.tsx`

**Interfaces:**
- Consumes: `studioPageAccess` (page-guard), `getServerSession`/`authOptions`, `ToastProvider`.
- Produces: `StudioBookingClient({ viewerName }: { viewerName: string | null })` — a client orchestrator that fetches `/api/studio/bookings` for the visible week and renders the week grid + panels. This task ships a **minimal** version (fetch + textual list) that later tasks extend.

- [ ] **Step 1: Create the layout (mounts ToastProvider)**

Create `app/studio/layout.tsx`:

```tsx
import { ToastProvider } from "@/components/local-ui/Toast";

export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-white">{children}</main>
    </ToastProvider>
  );
}
```

- [ ] **Step 2: Create the gated page**

Create `app/studio/page.tsx`:

```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { studioPageAccess } from "@/lib/page-guard";
import StudioBookingClient from "./StudioBookingClient";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const access = await studioPageAccess(); // redirects if signed out
  const session = await getServerSession(authOptions);

  if (access === "denied") {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-2xl font-light tracking-tight">Studio booking</h1>
        <p className="mt-4 text-muted-foreground">
          You&apos;re signed in as <span className="text-white">{session?.user?.email}</span>, but this
          account isn&apos;t on the studio access list yet. Ask the label to add you, then reload.
        </p>
      </div>
    );
  }

  return <StudioBookingClient viewerName={session?.user?.name ?? null} />;
}
```

- [ ] **Step 3: Create the minimal client orchestrator**

Create `app/studio/StudioBookingClient.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { weekDays } from "@/lib/studio-view";
import { formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export type Booking = {
  id: string; start: string; end: string;
  title: string | null; bookerName: string | null; mine: boolean; notes: string | null;
};

export default function StudioBookingClient({ viewerName }: { viewerName: string | null }) {
  const toast = useToast();
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => weekDays(anchor), [anchor]);
  const from = days[0].startUtc;
  const to = new Date(days[6].startUtc.getTime() + 864e5);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/studio/bookings?from=${from.toISOString()}&to=${to.toISOString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(data.bookings as Booking[]);
    } catch {
      toast.error("Couldn't load bookings.");
    } finally {
      setLoading(false);
    }
  }, [from, to, toast]);

  useEffect(() => { void load(); }, [load]);

  const shiftWeek = (delta: number) => setAnchor(new Date(anchor.getTime() + delta * 7 * 864e5));

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Studio booking</h1>
          <p className="text-sm text-muted-foreground">All times shown in UK time (Europe/London).</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftWeek(-1)} aria-label="Previous week" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm text-muted-foreground">{formatStudioDate(days[0].startUtc)} – {formatStudioDate(days[6].startUtc)}</span>
          <button onClick={() => shiftWeek(1)} aria-label="Next week" className="rounded-lg border border-white/10 p-2 hover:bg-white/5"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {bookings.length === 0 ? <li className="text-muted-foreground">No bookings this week.</li> : null}
          {bookings.map((b) => (
            <li key={b.id} className="rounded border border-white/10 px-3 py-2">
              {formatStudioDate(new Date(b.start))} · {formatStudioTime(new Date(b.start))}–{formatStudioTime(new Date(b.end))}
              {b.title ? ` — ${b.title}` : ""} {b.mine ? <span className="text-emerald-400">(you)</span> : b.bookerName ? `— ${b.bookerName}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manually verify gating (⚠️ live prod DB)**

Start the dev server if not running: `npm run dev`. In the browser: signed out → `/studio` redirects to `/login`. Signed in as a non-allowlisted account → the access-denied screen. As an owner (bootstrap email) → the week list renders. Confirm all three.

- [ ] **Step 6: Commit**

```bash
git --literal-pathspecs add app/studio/layout.tsx app/studio/page.tsx app/studio/StudioBookingClient.tsx
git commit -m "feat(studio): gated booker page + week data shell"
```

---

## Task 9: WeekGrid presentational component

**Files:**
- Create: `components/studio/WeekGrid.tsx`
- Modify: `app/studio/StudioBookingClient.tsx` (swap the textual list for `<WeekGrid>`)

**Interfaces:**
- Consumes: `DayColumn`, `segmentForDay`, `addDaysKey` (studio-view), `studioDayStartUtc`, `formatStudioTime` (studio-schedule), `Booking` type (from client).
- Produces: `WeekGrid({ days, bookings, onSelectSlot, onSelectBooking })`, where `onSelectSlot(dateKey: string, hour: number)` fires when a free cell is clicked and `onSelectBooking(b: Booking)` when a block is clicked.

- [ ] **Step 1: Implement `components/studio/WeekGrid.tsx`**

Create `components/studio/WeekGrid.tsx`:

```tsx
"use client";

import { Fragment } from "react";
import type { Booking } from "@/app/studio/StudioBookingClient";
import { type DayColumn, segmentForDay, addDaysKey } from "@/lib/studio-view";
import { studioDayStartUtc, formatStudioTime } from "@/lib/studio-schedule";

const HOUR_PX = 40; // row height per hour
const HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function WeekGrid({
  days, bookings, onSelectSlot, onSelectBooking,
}: {
  days: DayColumn[];
  bookings: Booking[];
  onSelectSlot: (dateKey: string, hour: number) => void;
  onSelectBooking: (b: Booking) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `56px repeat(7, 1fr)` }}>
        {/* Header row */}
        <div />
        {days.map((d) => (
          <div key={d.dateKey} className={`border-b border-white/10 pb-2 text-center text-xs ${d.isToday ? "text-emerald-400" : "text-muted-foreground"}`}>
            {new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric" }).format(d.startUtc)}
          </div>
        ))}

        {/* Time axis + day columns */}
        <div className="relative" style={{ height: HOUR_PX * 24 }}>
          {HOURS.map((h) => (
            <div key={h} className="absolute right-1 text-[10px] text-muted-foreground" style={{ top: h * HOUR_PX - 6 }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {days.map((day) => {
          const nextStart = studioDayStartUtc(addDaysKey(day.dateKey, 1));
          return (
            <div key={day.dateKey} className="relative border-l border-white/10" style={{ height: HOUR_PX * 24 }}>
              {/* Clickable hour cells */}
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onSelectSlot(day.dateKey, h)}
                  className="absolute left-0 right-0 border-b border-white/5 hover:bg-white/5"
                  style={{ top: h * HOUR_PX, height: HOUR_PX }}
                  aria-label={`Book ${day.dateKey} ${String(h).padStart(2, "0")}:00`}
                />
              ))}
              {/* Booking blocks */}
              {bookings.map((b) => {
                const seg = segmentForDay(new Date(b.start), new Date(b.end), day, nextStart);
                if (!seg) return null;
                const top = (seg.topMin / 60) * HOUR_PX;
                const height = Math.max(((seg.bottomMin - seg.topMin) / 60) * HOUR_PX, 14);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSelectBooking(b)}
                    className={`absolute left-1 right-1 overflow-hidden rounded px-1.5 py-0.5 text-left text-[11px] leading-tight ${b.mine ? "bg-emerald-500/30 ring-1 ring-emerald-400/50" : "bg-sky-500/25 ring-1 ring-sky-400/40"}`}
                    style={{ top, height }}
                    title={`${formatStudioTime(new Date(b.start))}–${formatStudioTime(new Date(b.end))}${b.title ? ` · ${b.title}` : ""}`}
                  >
                    <span className="block truncate font-medium">{formatStudioTime(new Date(b.start))} {b.title ?? (b.mine ? "Your booking" : "Booked")}</span>
                    {b.bookerName ? <span className="block truncate text-white/70">{b.mine ? "You" : b.bookerName}</span> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the client**

In `app/studio/StudioBookingClient.tsx`, add the import at the top:

```tsx
import WeekGrid from "@/components/studio/WeekGrid";
```

Replace the `{loading ? (...) : (<ul>...</ul>)}` block with:

```tsx
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <WeekGrid
          days={days}
          bookings={bookings}
          onSelectSlot={(dateKey, hour) => { void dateKey; void hour; /* wired in Task 10 */ }}
          onSelectBooking={(b) => { void b; /* wired in Task 11 */ }}
        />
      )}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Verify in the browser: the week grid renders with hour rows, and this week's bookings appear as blocks at the right times (yours emerald, others sky).

- [ ] **Step 4: Commit**

```bash
git --literal-pathspecs add components/studio/WeekGrid.tsx app/studio/StudioBookingClient.tsx
git commit -m "feat(studio): visual week time-grid"
```

---

## Task 10: Create-booking dialog

**Files:**
- Create: `components/studio/BookingDialog.tsx`
- Modify: `app/studio/StudioBookingClient.tsx` (open dialog from slot click; POST; refresh)

**Interfaces:**
- Consumes: Radix `Dialog` primitives from `@/components/ui/dialog`, `Button` from `@/components/ui/button`, `addDaysKey` (studio-view).
- Produces: `BookingDialog({ open, onOpenChange, mode, initial, submitting, onSubmit })` where `initial: { startDate; startTime; endDate; endTime; title; notes }` and `onSubmit(values: typeof initial): void`. `mode` is `"create" | "edit"` (title/label only).

- [ ] **Step 1: Implement `components/studio/BookingDialog.tsx`**

Create `components/studio/BookingDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type BookingForm = {
  startDate: string; startTime: string; endDate: string; endTime: string;
  title: string; notes: string;
};

export default function BookingDialog({
  open, onOpenChange, mode, initial, submitting, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initial: BookingForm;
  submitting: boolean;
  onSubmit: (values: BookingForm) => void;
}) {
  const [form, setForm] = useState<BookingForm>(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, initial]);

  const set = (k: keyof BookingForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const field = "w-full rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Book the studio" : "Edit booking"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Start date
              <input type="date" value={form.startDate} onChange={set("startDate")} className={field} required />
            </label>
            <label className="text-xs text-muted-foreground">Start time
              <input type="time" value={form.startTime} onChange={set("startTime")} className={field} required />
            </label>
            <label className="text-xs text-muted-foreground">End date
              <input type="date" value={form.endDate} onChange={set("endDate")} className={field} required />
            </label>
            <label className="text-xs text-muted-foreground">End time
              <input type="time" value={form.endTime} onChange={set("endTime")} className={field} required />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">Session title (optional)
            <input type="text" value={form.title} onChange={set("title")} placeholder="e.g. Vocal tracking" className={field} maxLength={200} />
          </label>
          <label className="block text-xs text-muted-foreground">Private notes (only you &amp; the label)
            <textarea value={form.notes} onChange={set("notes")} rows={2} className={field} maxLength={2000} />
          </label>
          <p className="text-xs text-muted-foreground">Times are UK time (Europe/London).</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : mode === "create" ? "Book" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

> Note: `Button` (`components/ui/button.tsx`) supports `variant` values `default | destructive | outline | secondary | ghost | link` and `size` — `variant="outline"` used here is valid as written.

- [ ] **Step 2: Wire create into the client**

In `app/studio/StudioBookingClient.tsx`:

Add imports:

```tsx
import BookingDialog, { type BookingForm } from "@/components/studio/BookingDialog";
import { addDaysKey } from "@/lib/studio-view";
```

Add state inside the component (after `loading`):

```tsx
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState<BookingForm | null>(null);

  const openCreate = (dateKey: string, hour: number) => {
    const startTime = `${String(hour).padStart(2, "0")}:00`;
    const endHour = (hour + 1) % 24;
    const endDate = endHour === 0 ? addDaysKey(dateKey, 1) : dateKey;
    const endTime = `${String(endHour).padStart(2, "0")}:00`;
    setDraft({ startDate: dateKey, startTime, endDate, endTime, title: "", notes: "" });
    setDialogOpen(true);
  };

  const submitCreate = async (values: BookingForm) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/studio/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't book that slot."); return; }
      toast.success("Booked.");
      setDialogOpen(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };
```

Change the `onSelectSlot` prop on `<WeekGrid>` to `onSelectSlot={openCreate}`.

Add the dialog at the end of the returned JSX (before the closing `</div>`):

```tsx
      {draft ? (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode="create"
          initial={draft}
          submitting={submitting}
          onSubmit={submitCreate}
        />
      ) : null}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify create + overlap (⚠️ live prod DB — clean up after)**

In the browser as an allowed user: click a free hour cell → dialog opens prefilled → Book → the block appears. Click an overlapping slot and try to book → red toast "overlaps an existing booking." **Delete the test booking afterward** (via Task 11's cancel, or note its id to remove).

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add components/studio/BookingDialog.tsx app/studio/StudioBookingClient.tsx
git commit -m "feat(studio): create-booking dialog wired to the grid"
```

---

## Task 11: My bookings panel — cancel + edit own

**Files:**
- Create: `components/studio/MyBookings.tsx`
- Modify: `app/studio/StudioBookingClient.tsx` (render panel; cancel/edit handlers; open dialog in edit mode)

**Interfaces:**
- Consumes: `Booking` type, `formatStudioDate`, `formatStudioTime`, `studioParts` (for prefilling edit form), `Button`.
- Produces: `MyBookings({ bookings, onEdit, onCancel })` — lists the caller's upcoming own bookings with Edit/Cancel buttons.

- [ ] **Step 1: Implement `components/studio/MyBookings.tsx`**

Create `components/studio/MyBookings.tsx`:

```tsx
"use client";

import type { Booking } from "@/app/studio/StudioBookingClient";
import { Button } from "@/components/ui/button";
import { formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export default function MyBookings({
  bookings, onEdit, onCancel,
}: {
  bookings: Booking[];
  onEdit: (b: Booking) => void;
  onCancel: (b: Booking) => void;
}) {
  const mineUpcoming = bookings
    .filter((b) => b.mine && new Date(b.start).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start));

  if (mineUpcoming.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Your upcoming bookings</h2>
      <ul className="space-y-2">
        {mineUpcoming.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span>
              {formatStudioDate(new Date(b.start))} · {formatStudioTime(new Date(b.start))}–{formatStudioTime(new Date(b.end))}
              {b.title ? ` — ${b.title}` : ""}
            </span>
            <span className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onEdit(b)}>Edit</Button>
              <Button type="button" variant="outline" onClick={() => onCancel(b)}>Cancel</Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Wire edit + cancel into the client**

In `app/studio/StudioBookingClient.tsx`:

Add imports:

```tsx
import MyBookings from "@/components/studio/MyBookings";
import { studioParts } from "@/lib/studio-schedule";
```

Add edit state + handlers (after `submitCreate`):

```tsx
  const [editId, setEditId] = useState<string | null>(null);

  const openEdit = (b: Booking) => {
    const s = studioParts(new Date(b.start));
    const e = studioParts(new Date(b.end));
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditId(b.id);
    setDraft({
      startDate: `${s.year}-${pad(s.month)}-${pad(s.day)}`,
      startTime: `${pad(s.hour)}:${pad(s.minute)}`,
      endDate: `${e.year}-${pad(e.month)}-${pad(e.day)}`,
      endTime: `${pad(e.hour)}:${pad(e.minute)}`,
      title: b.title ?? "",
      notes: b.notes ?? "",
    });
    setDialogOpen(true);
  };

  const submitEdit = async (values: BookingForm) => {
    if (!editId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/studio/bookings/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't update the booking."); return; }
      toast.success("Updated.");
      setDialogOpen(false);
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBooking = async (b: Booking) => {
    if (!confirm("Cancel this booking? The slot will be freed.")) return;
    try {
      const res = await fetch(`/api/studio/bookings/${b.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't cancel."); return; }
      toast.success("Cancelled.");
      await load();
    } catch {
      toast.error("Couldn't cancel.");
    }
  };
```

Change `openCreate` to also clear edit mode by adding `setEditId(null);` as its first line.

Change the dialog's `mode` and `onSubmit` to branch on `editId`:

```tsx
      {draft ? (
        <BookingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          mode={editId ? "edit" : "create"}
          initial={draft}
          submitting={submitting}
          onSubmit={editId ? submitEdit : submitCreate}
        />
      ) : null}
```

Wire the grid's booking click to edit-your-own, and render the panel. Set `onSelectBooking={(b) => { if (b.mine) openEdit(b); }}` on `<WeekGrid>`, and add below the grid block:

```tsx
      <MyBookings bookings={bookings} onEdit={openEdit} onCancel={cancelBooking} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify (⚠️ live prod DB — clean up after)**

As an allowed user: create a booking, then Edit it to a new free time (grid updates), then Cancel it (block disappears, slot reusable). Confirm you cannot edit/cancel someone else's block (clicking a sky block does nothing).

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add components/studio/MyBookings.tsx app/studio/StudioBookingClient.tsx
git commit -m "feat(studio): edit + cancel your own bookings"
```

---

## Task 12: Admin studio page + sidebar nav

**Files:**
- Create: `app/admin/studio/page.tsx`
- Create: `app/admin/studio/StudioAdminClient.tsx`
- Modify: `components/admin/shell/AdminSidebar.tsx` (add owner-only "Studio" link)

**Interfaces:**
- Consumes: `requirePageOwner` (page-guard), `prisma`, `PageHeader`, `useToast`, `Button`, `formatStudioDate`/`formatStudioTime`.
- Produces: an owner-only page listing all upcoming bookings (with cancel-any) and the allowlist manager.

- [ ] **Step 1: Create the admin server page**

Create `app/admin/studio/page.tsx`:

```tsx
import { requirePageOwner } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/admin/shell/PageHeader";
import StudioAdminClient, { type AdminBooking, type AdminBooker } from "./StudioAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminStudioPage() {
  await requirePageOwner();

  let bookings: AdminBooking[] = [];
  let bookers: AdminBooker[] = [];
  try {
    const [bRows, kRows] = await Promise.all([
      prisma.studioBooking.findMany({ where: { status: "confirmed", end: { gt: new Date() } }, orderBy: { start: "asc" }, take: 500 }),
      prisma.studioBooker.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    bookings = bRows.map((b) => ({ id: b.id, start: b.start.toISOString(), end: b.end.toISOString(), title: b.title, bookerName: b.bookerName, bookerEmail: b.bookerEmail }));
    bookers = kRows.map((k) => ({ id: k.id, email: k.email, name: k.name, note: k.note, createdAt: k.createdAt.toISOString() }));
  } catch {
    // Empty on a transient DB error.
  }

  return (
    <div>
      <PageHeader title="Studio" description="Manage who can book the studio, and see or cancel any booking." />
      <StudioAdminClient initialBookings={bookings} initialBookers={bookers} />
    </div>
  );
}
```

- [ ] **Step 2: Create the admin client**

Create `app/admin/studio/StudioAdminClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { Button } from "@/components/ui/button";
import { formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export type AdminBooking = { id: string; start: string; end: string; title: string | null; bookerName: string | null; bookerEmail: string };
export type AdminBooker = { id: string; email: string; name: string | null; note: string | null; createdAt: string };

export default function StudioAdminClient({
  initialBookings, initialBookers,
}: { initialBookings: AdminBooking[]; initialBookers: AdminBooker[] }) {
  const toast = useToast();
  const [bookings, setBookings] = useState(initialBookings);
  const [bookers, setBookers] = useState(initialBookers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const addBooker = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/studio/bookers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "Couldn't add."); return; }
      setBookers((prev) => [data.booker, ...prev]);
      setEmail(""); setName("");
      toast.success("Added to the studio access list.");
    } finally { setBusy(false); }
  };

  const removeBooker = async (id: string) => {
    if (!confirm("Remove this person's studio access?")) return;
    const res = await fetch(`/api/studio/bookers/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't remove."); return; }
    setBookers((prev) => prev.filter((b) => b.id !== id));
    toast.success("Removed.");
  };

  const cancelBooking = async (id: string) => {
    if (!confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/studio/bookings/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Couldn't cancel."); return; }
    setBookings((prev) => prev.filter((b) => b.id !== id));
    toast.success("Booking cancelled.");
  };

  const field = "rounded-md border border-white/10 bg-transparent px-3 py-2 text-sm";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Studio access list</h2>
        <form onSubmit={addBooker} className="mb-4 flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Google email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={`block ${field}`} />
          </label>
          <label className="text-xs text-muted-foreground">Name (optional)
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`block ${field}`} />
          </label>
          <Button type="submit" disabled={busy}><UserPlus className="mr-1 h-4 w-4" /> Add</Button>
        </form>
        <ul className="space-y-1">
          {bookers.length === 0 ? <li className="text-sm text-muted-foreground">No one added yet.</li> : null}
          {bookers.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span><span className="text-white">{b.email}</span>{b.name ? ` — ${b.name}` : ""}</span>
              <button type="button" onClick={() => removeBooker(b.id)} aria-label={`Remove ${b.email}`} className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming bookings</h2>
        <ul className="space-y-1">
          {bookings.length === 0 ? <li className="text-sm text-muted-foreground">No upcoming bookings.</li> : null}
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span>
                {formatStudioDate(new Date(b.start))} · {formatStudioTime(new Date(b.start))}–{formatStudioTime(new Date(b.end))}
                {b.title ? ` — ${b.title}` : ""} <span className="text-muted-foreground">· {b.bookerName ?? b.bookerEmail}</span>
              </span>
              <button type="button" onClick={() => cancelBooking(b.id)} aria-label="Cancel booking" className="text-muted-foreground hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Add the sidebar nav link**

In `components/admin/shell/AdminSidebar.tsx`:

Add `CalendarClock` to the lucide import list at the top (append to the destructured names).

In the `System` group's `links` array, add as the first entry (owner-only):

```tsx
      { href: "/admin/studio", label: "Studio", icon: CalendarClock, perm: "owner" },
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manually verify (⚠️ live prod DB — clean up after)**

As an owner: `/admin/studio` shows the sidebar "Studio" link and the page. Add a test email → appears in the list and can now open `/studio`. Remove it → it disappears and that email is denied again. Cancel an upcoming booking → it disappears. **Remove any test allowlist rows/bookings afterward.**

- [ ] **Step 6: Commit**

```bash
git --literal-pathspecs add "app/admin/studio/page.tsx" "app/admin/studio/StudioAdminClient.tsx" components/admin/shell/AdminSidebar.tsx
git commit -m "feat(studio): owner admin page (allowlist + bookings) and nav"
```

---

## Task 13: Final verification & finishing

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors/warnings introduced by the new files.

- [ ] **Step 3: Unit tests**

Run: `npm run test -- studio`
Expected: PASS — `studio-schedule` and `studio-view` suites all green.

- [ ] **Step 4: End-to-end smoke (⚠️ live prod DB — clean up every test row)**

As owner: add a second Google account to the allowlist; sign in as that account; confirm `/studio` opens, book a session, edit it, cancel it. Try to double-book (expect the 409 toast). Remove the test account from the allowlist and confirm access is denied. Delete any lingering test bookings. Verify the admin "Audit log" shows the studio create/cancel/grant/revoke entries.

- [ ] **Step 5: Note the deploy step (do NOT run without approval)**

Record for the human: going live requires pushing the two new models' indexes to prod via the gated `npm run db:deploy` (see `DEPLOY.md`), and deploying the branch. This is a separate, approval-gated step.

- [ ] **Step 6: Invoke the finishing skill**

Use `superpowers:finishing-a-development-branch` to choose how to integrate the `studio-booking` branch (PR / merge / cleanup). Do not push or deploy without explicit approval.

---

## Self-Review

**Spec coverage:**
- Admin-managed allowlist → Task 1 (model), Task 7 (API), Task 12 (UI). ✓
- Page/API gating, not middleware → Task 4 (`requireStudioAccess`, `studioPageAccess`), Task 8 (page). ✓
- Date + start/end bookings, overlaps rejected → Task 2 (validate/overlap), Task 5 (POST overlap check). ✓
- Instant self-service → Task 5 (create, status "confirmed", no approval). ✓
- Cancel + edit own → Task 6 (API), Task 11 (UI). ✓
- 24h hours, Europe/London, DST → Task 2 (`zonedWallTimeToUtc`, tests). ✓
- Week time-grid + week nav → Task 3 (`weekDays`/`segmentForDay`), Task 9 (WeekGrid). ✓
- Owner-only admin + cancel any → Task 4 (`requirePageOwner`), Task 12. ✓
- Name+title visible to fellow bookers, notes private → Task 5 (GET serializer gates `notes`), Task 9 (block shows name/title). ✓
- Audit on writes → Tasks 5/6/7 (`recordAudit`), plus `AUDIT_RESOURCES` additions. ✓
- Concurrency note (check-then-insert) → Task 5 overlap-before-insert. ✓
- Prod-data caution → Global Constraints + manual-verify steps flag cleanup. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Two explicit confirm-this notes (`Button` variant prop; `guard.token.name` cast) give the exact fallback, not a vague instruction. ✓

**Type consistency:** `Booking` DTO shape identical across `StudioBookingClient`, `WeekGrid`, `MyBookings`, and both API responses (`id/start/end/title/bookerName/mine/notes`). `BookingForm` fields match `validateBookingInput`'s `BookingTimeInput` plus `title`/`notes`. `DayColumn`/`Segment` used consistently by `weekDays`/`segmentForDay`/`WeekGrid`. Guard/audit/resolver signatures match the real source read during planning. ✓
