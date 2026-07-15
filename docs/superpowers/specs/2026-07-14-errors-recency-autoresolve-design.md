# Errors: recency-driven Live/Log (auto-resolve) — Design

**Date:** 2026-07-14
**Status:** Approved
**Branch:** `admin-press-errors-page-media`

## Problem

The admin Errors page splits errors into a **Live** feed ("current bugs") and a
**Log** ("resolved"). Today that split is driven **only** by a manual `resolved`
boolean: an error enters Live the first time it fires and stays there **forever**
until a human clicks the ✓ button. The only automatic movement is the reverse —
`recordError` clears `resolved` when a fingerprint recurs
(`lib/error-log.ts`), so a resolved error re-opens on recurrence.

Consequence: "Live" does not mean "happening now"; it means "everything that ever
happened, minus what was manually archived." The user must hand-resolve every
error, and the red Live badge is an all-time backlog, not a current-bug count.

## Goal

Make the Live/Log split reflect **whether the error is still occurring**, with no
manual bookkeeping required. An error that stops firing should move itself to the
Log; one that fires again should return to Live (already handled).

## Approach — read-time recency rule (no schema, no cron)

Every row already stores `lastSeen` and `count`, and the schema already indexes
`[resolved, lastSeen]` and `[lastSeen]`. So we derive the split at query time from
`lastSeen` against a fixed window, keeping `resolved` only as a manual override.

**Window:** `LIVE_WINDOW_MS = 24h` (user-chosen). `cutoff = now − 24h`.

**Effective status:**
- **Live**  = `resolved = false AND lastSeen >= cutoff`  (firing in the last 24h, not manually dismissed)
- **Log**   = `resolved = true  OR  lastSeen <  cutoff`   (manually dismissed, or gone quiet ≥ 24h)

Self-maintaining: ship a fix → error stops firing → after 24h of silence it crosses
into the Log on its own. If it recurs, `recordError` bumps `lastSeen` and sets
`resolved = false`, so it snaps back to Live. No new writes, no scheduled job — a
cron would only duplicate the read-time rule.

## Manual override (kept, reframed)

The ✓ / reopen buttons stay but are now optional conveniences, not chores:
- **✓ "Resolve now"** on a Live row → `resolved = true` (instant move to Log without
  waiting out the 24h; for "I fixed it, get it out of Live now").
- **Reopen** on a Log row → `resolved = false`. Only meaningful for a
  manually-dismissed-but-still-recent row; a genuinely-quiet (stale) row would
  simply remain in Log via the recency rule. UI may hide Reopen on stale rows.

## Changes

1. **`lib/error-log.ts`** — export `LIVE_WINDOW_MS` (24h) and a `liveCutoff()`
   helper (`new Date(Date.now() - LIVE_WINDOW_MS)`), so the rule lives in one place.
2. **`app/api/admin/error-log/route.ts` (GET)** — replace the `resolved` where-clause
   and the two badge counts with the recency rule:
   - Live view (`?resolved=false`): `{ resolved: false, lastSeen: { gte: cutoff } }`
   - Log view (`?resolved=true`):  `{ OR: [{ resolved: true }, { lastSeen: { lt: cutoff } }] }`
   - `unresolved` badge = count of the **Live** rule (global, source-independent, as today).
   - `resolvedCount` badge = count of the **Log** rule.
   - `source`/`level` filters continue to AND into the per-view `where`.
   PATCH/DELETE unchanged.
3. **`app/admin/errors/page.tsx`** — copy only: clarify Live = "seen in the last 24h".
   Tabs, 20s auto-refresh, stale-while-revalidate cache already work unchanged.

## Non-goals

- No new DB fields or migration.
- No cron / scheduled job.
- No change to error capture (`recordError`, instrumentation, client logger).

## Verification

- `npx tsc --noEmit` and `npx eslint` clean on the three touched files.
- Read-only check against the live (London) DB: confirm existing rows partition
  correctly under the 24h rule (recent vs stale) without any writes.
- Manual walk: a recent error shows in Live; a row with `lastSeen` > 24h ago shows
  in Log even though `resolved = false`; ✓ moves a live row to Log immediately.
