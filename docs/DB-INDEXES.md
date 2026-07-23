# Database indexes — drift, deployment, and the ErrorLog duplicates

`prisma db push` is the only thing that creates indexes in this project, and it's
a manual step (`npm run db:deploy`). So the live database can and does fall
behind `prisma/schema.prisma` between a schema change and a deploy. This
documents how to see the gap, how to close it safely, and the one piece of data
that has to be fixed before it can be closed at all.

## Seeing the gap

```bash
npm run db:check-indexes          # human-readable
npm run db:check-indexes -- --json
```

Read-only — creates nothing, drops nothing, safe against production at any time.
Exit codes are load-bearing (the deploy gates on them): **0** = the check ran,
no drift; **1** = the check ran, drift found; **2** = the check **could not
run** (missing driver, no `DATABASE_URL`, unreachable DB). The deploy aborts
before `prisma db push` on anything other than 0/1 — a broken safety check must
never be mistaken for ordinary drift and skipped.

`npm run db:deploy` now runs it twice: once before the push (so you see what's
about to change) and once after (the deploy **fails** if the database still
drifts, rather than reporting success on a partial index build).

The parser behind it is pinned by `lib/schema-indexes.test.ts` — including a test
that it finds a non-trivial number of indexes, because a parser that silently
matched nothing would report "no drift" forever and be worse than no check.

## Measured state

**2026-07-23: DEPLOYED — zero drift.** The guarded deploy ran (after the
ErrorLog dedupe and an owner-confirmed Atlas snapshot): all 33 missing indexes
built and the 6 empty collections created, `db:check-indexes` exits 0.
Spot-checks confirm `Release.primaryArtistIds` and `ErrorLog.fingerprint`
queries now IXSCAN, and both behavioral unique constraints
(`ErrorLog_fingerprint_key`, `AutomationFire_ruleKey_entityType_entityId_key`)
report `unique: true` — error dedup and automation idempotency are enforced at
the database level from here on. The section below is the pre-deploy record.

## Pre-deploy state (2026-07-22, historical)

83 indexes declared; **39 discrepancies**.

**Six collections don't exist yet:** `MessageReply`, `Demo`, `Placement`,
`Asset`, `AutomationRule`, `AutomationFire`. MongoDB creates a collection on its
first insert, so this means *no row has ever been written* — these are features
shipped but not yet used in production, not lost data. `prisma db push` creates
them along with their indexes. Nothing to recover.

**33 missing indexes**, including everything the audit listed and several it
didn't:

| Collection | Missing |
|---|---|
| `ErrorLog` | `fingerprint` **(UNIQUE)**, `[resolved, lastSeen]`, `lastSeen`, `source` |
| `AuditLog` | `at`, `[resource, at]`, `[actorId, at]` |
| `ContactMessage` | `createdAt`, `[handled, createdAt]`, `[status, createdAt]` |
| `OutreachTask` | `status`, `priority`, `category`, `isTemplate`, `dueAt`, `assigneeId` |
| `OutreachContact` | `relationshipStatus`, `type`, `createdAt` |
| `PitchLog` | `contactId`, `status`, `followUpDueAt`, `createdAt` |
| `Campaign` | `[status, scheduledFor]`, `createdAt` |
| `TaskComment` | `[taskId, createdAt]`, `mentions` |
| `Release` | `primaryArtistIds`, `featureArtistIds` |
| `Track` | `primaryArtistIds`, `featureArtistIds` |
| `SavedView` | `userId` |
| `ContentPost` | `scheduledFor` |

Only one of these changes *behaviour* rather than speed: **`ErrorLog.fingerprint`
being unique**. The rest are performance, and the application is correct without
them — just slower as collections grow.

## The blocker: 4 duplicate ErrorLog fingerprints

**`prisma db push` will fail** while these exist — a unique index cannot be built
over duplicate values. Resolve first.

**How they happened.** `lib/error-log.ts` de-duplicates with `findUnique` →
(miss) → `create`, and catches Prisma's `P2002` for the race where two identical
errors arrive at once. With no unique index in the database there is nothing to
violate, so `P2002` never fires and both writes create a row. The duplicates are
the symptom; the missing index is the cause — which is why creating the index
also fixes the recurrence.

All ten duplicate rows come from a single ~2-second window on 2026-06-23, a burst
of `Inconsistent column data` / `DB unavailable` errors during a database outage.
All are already `resolved`.

```bash
npm run db:dedupe-errors             # dry run: prints every group, writes nothing
npm run db:dedupe-errors -- --apply  # merge
```

**Merge rule.** The survivor is the row with the newest `lastSeen` — it holds the
freshest sample (message, stack, path, user agent). It then absorbs:

- `count` = sum across the group (occurrences were split across the rows)
- `firstSeen` = earliest in the group
- `lastSeen` = latest in the group
- `resolved` = `false` if **any** row is unresolved (a live recurrence re-opens it)

The other rows are deleted. **No occurrence counts are lost** — they're summed
into the survivor.

## Deployment runbook

1. **Back up.** Atlas keeps automated snapshots; confirm a recent one exists (or
   take an on-demand snapshot) before step 3. Nothing here does that for you.
2. **Deduplicate:** `npm run db:dedupe-errors` (review), then `-- --apply`.
   Re-run the dry run; it should report no duplicate groups.
3. **Deploy:** `npm run db:deploy` (preview), then `-- --confirm`.
   The push creates the six missing collections and all 33 indexes. Index builds
   on collections this size (largest is `PlayEvent`, low thousands) complete in
   seconds; Atlas builds indexes without blocking reads or writes.
4. **Verify:** the deploy runs the drift check itself and fails if anything
   remains. `npm run db:check-indexes` should exit 0.
5. **Spot-check a query plan** for the indexes that matter most — the artist-array
   multikey indexes drive the public artist pages:

   ```js
   db.Release.find({ primaryArtistIds: ObjectId("…") }).explain("executionStats")
   // want: IXSCAN, not COLLSCAN
   ```

**Do not** run `prisma db push` directly before step 2 — it will fail partway on
the unique index, having already created some of the others, leaving a half-built
state that's harder to reason about than the current one.

## Ongoing monitoring

`npm run db:check-indexes` exits non-zero on drift, so it can be wired to a cron
or a CI job. **It is not scheduled today** — drift detection currently only runs
when someone runs it, or as part of a deploy. Scheduling it is the outstanding
piece of work.

## Intentionally omitted indexes

None at present. When one is added, record it in `INTENTIONALLY_UNINDEXED` in
`scripts/check-index-drift.mjs` with a `reason`, and it will be excluded from the
drift report rather than showing up as permanent noise. Keep the reason specific
("write-heavy, never queried by this field"), not "not needed".
