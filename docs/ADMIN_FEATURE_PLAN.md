# Admin / Ops Feature Plan

A consolidated backlog of every feature idea raised for the admin area — the Tasks view
plus the wider label-operations tooling. Benchmarked against **Atera** (ticketing,
automation, SLAs, dashboards) and **Notion** (flexible databases, views, relations,
templates), then extended with label-specific operations.

This is a **planning document only** — no code has been written. It's the menu we pick
from, sequenced so each build makes the next one easier.

> **Design principle:** don't rebuild Atera or Notion. Cherry-pick the handful of patterns
> that fit a small independent label and connect the data we already store.

---

## What already exists (the starting point)

- **Tasks** (`/admin/tasks`): List + Calendar views, "Needs attention" tab, 26 suggested
  tasks, categories (pitching/research/admin/social/sync/radio/catalog), priorities with
  auto-sort, todo/in-progress/done, due dates + overdue, create/edit/delete, client caching.
- **Outreach** (`/admin/outreach`): Contacts (mini-CRM) + Pitch tracker (`PitchLog`).
- **Messages** (`/admin/messages`): inbound contact form → `ContactMessage` (`handled` boolean only).
- **Catalog**: Releases (with `upcCode`, `catalogueNumber`, `isrcCode`, `pLine`, `cLine`,
  `credits` JSON), Artists (`wikidataId`, `wikipediaUrl`), Press.
- **Subscribers**, **Live data** (audience analytics: `PlayEvent`, `LinkClick`), **Errors**.
- Auth: roles are effectively **admin / user** (coarse). S3 for media.

Two instincts are already in the codebase and worth deepening:
- **"Needs attention" ≈ Atera monitoring → alerts.**
- **Tasks List + Calendar ≈ Notion multi-view.**

---

## Prioritized roadmap

Ordered so foundational pieces unlock the rest. Effort is rough: **S** ≤ a day,
**M** a few days, **L** a week+.

### Phase 1 — Task management foundation
The core upgrades that make Tasks usable by a team.

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 1 | **Assignees + "My tasks"** | S–M | Add `assigneeId` to `OutreachTask` + user picker + filter. Prereq for reminders, digests, roles. |
| 2 | **Recurring tasks** | M | "Repeat weekly/monthly" — regenerate on completion. |
| 3 | **Subtasks / checklists** | S | Nested items with their own done-state; progress %. |
| 4 | **Blocked / waiting status** | S | Extend status enum beyond todo/in-progress/done. |
| 5 | **Bulk actions** | S | Multi-select → set status/assignee/due/delete. |
| 6 | **Comments + activity log (per task)** | M | Thread + who-changed-what. Foundation for @mentions. |
| 7 | **Attachments** | S | Files on a task (S3 already available). |

### Phase 2 — Connect the data (Notion relations)
The single highest-leverage architectural change. Everything downstream gets better.

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 8 | **Relations + rollups** | L | Connect Tasks ↔ Releases ↔ Artists ↔ Pitches ↔ Press. We already store `artistIds`/`releaseIds` — surface them as navigable, two-way links with rollups. |
| 9 | **Per-release rollup view** | M | On a Release: its tasks (progress %), pitches (accepted count), press coverage. |
| 10 | **Per-artist rollup view** | M | On an Artist: releases, tasks, coverage, (later) royalties. |
| 11 | **Grouping (by assignee / release / category)** | S | First-class group-by, not just a single filter. |

### Phase 3 — Views & flexibility (Notion)
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 12 | **Board (kanban) view** | M | Columns by status/category; drag to move. |
| 13 | **Timeline / Gantt view** | M | Release rollout across weeks — ideal for campaigns. |
| 14 | **Saved views** | M | Persist per-user filtered views ("My overdue", "This week's pitching", "<Release> campaign"). |
| 15 | **Custom properties** | M | Lightweight extra fields: tags, effort estimate, budget. (Not fully dynamic — a few structured additions.) |
| 16 | **Templates** | M | Release-campaign checklist templates, artist-onboarding templates, pitch-email templates. Extends today's 26 suggestions. |

### Phase 4 — Automation & inbox (Atera)
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 17 | **Automation rules ("when X → do Y")** | L | Pitch = Accepted → create press task; release −3 weeks → spawn campaign checklist; new message → create ticket. Turns "needs attention" from reactive to active. |
| 18 | **Unified Inbox / ticketing** | M–L | Upgrade `ContactMessage` from `handled` boolean → status (open/in-progress/resolved) + assignee + priority + reply thread. |
| 19 | **SLA / response targets** | M | "Respond within N days" on inbound + pitch follow-ups; flag breaches. |
| 20 | **Ops dashboard ("Today / This week")** | M | One morning screen: tasks due/overdue, pitches awaiting follow-up, unanswered messages, active-campaign progress. |
| 21 | **Smarter alert thresholds** | M | Extend needs-attention: release <7 days out missing artwork/links; pitch "sent" 14+ days no follow-up; artist idle N months. |
| 22 | **Reminders / daily digest** | M | Email/in-app: your tasks due today, overdue, breaches. Needs assignees (#1). |
| 23 | **Notifications center (in-app bell)** | S–M | Surfaces mentions, assignments, alerts. |

### Phase 5 — Money & rights (biggest label-specific gap)
Nothing in the current admin covers this. Highest business value.

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 24 | **Royalty & split tracking** | L | Per release, splits between artists/collaborators, owed vs. paid. Builds on `credits`, `pLine`/`cLine`, ISRC/UPC. |
| 25 | **Campaign budget & spend** | M | Per-campaign budget-vs-actual (SubmitHub/Groover/ads). Suggestions already reference "budget €50–100". |
| 26 | **Agreements / terms store** | M | Given the **non-exclusive** model: which release is under what terms (split %, rights, duration) per artist. |
| 27 | **Invoicing / payout statements** | M | Generate statements per artist from #24. |

### Phase 6 — Release operations
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 28 | **Release pipeline + distribution checklist** | M | Pipeline board of upcoming releases with delivery checklist: UPC/ISRC assigned, metadata complete, delivered, live-on-DSP confirmed. |
| 29 | **Asset library (DAM)** | M–L | Central store (S3) for masters, artwork, stems, press photos, EPKs per release/artist. |
| 30 | **Approval / sign-off gate** | S–M | "Release-ready" checklist that must pass before publish (artwork approved, links added, metadata done). |

### Phase 7 — A&R & artists
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 31 | **Demo / A&R pipeline** | M | Inbound demos → funnel: Received → Reviewing → Passed / Offer → Releasing, with a rating field. |
| 32 | **Artist onboarding checklist** | S–M | On add-artist: collect bio, photos, ISNI/IPI/MusicBrainz IDs, payout details. |

### Phase 8 — Marketing & reach
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 33 | **Placement tracker** | M | Log playlist adds (+ follower counts), blog/press coverage, radio adds — a running "wins" record for future pitching. |
| 34 | **Content / social calendar** | M | Plan posts per platform per release (distinct from task calendar). |
| 35 | **Newsletter campaigns** | M–L | Composer + scheduler + open/click stats over existing `Subscriber` list. |

### Phase 9 — Team & security *(pairs with the current security audit)*
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 36 | **Granular roles + permissions** | M | Scoped roles (Outreach-only, Catalog-editor, Read-only) vs. today's admin/all. Staff/PA see only what they need. |
| 37 | **Admin activity / audit log** | M | Who changed/deleted what across the admin — accountability + security trail. Extends the existing error log. |
| 38 | **@mentions** | S | Mention a teammate in a comment → notify/assign. Needs comments (#6) + notifications (#23). |

---

## Explicitly dropped
- **AI copilot** (draft pitches/bios/blurbs) — considered and **rejected** by the label.

---

## Recommended starting order

1. **Assignees (#1)** — tiny, unblocks reminders, digests, roles, "my tasks".
2. **Roles + audit log (#36, #37)** — directly supports the in-progress security audit; small-to-medium.
3. **Relations + rollups (#8)** — the structural leap; every dashboard/automation/campaign feature is better once entities are connected.
4. Then pick a vertical that delivers visible value fast: **Release pipeline + checklist (#28)** or **Royalty & split tracking (#24)**.

Rationale: 1–2 are cheap and timely, 3 is the multiplier, 4 is the first big win the label
will *feel*.

---

## Data-model additions (summary)

New/changed models implied by the above (to spec in detail when a phase is chosen):

- `OutreachTask`: `assigneeId`, `parentTaskId` (subtasks), `recurrence`, `status` enum
  (+blocked), `tags[]`, `effort`, `budget`, richer relation fields.
- `TaskComment` / `ActivityLog` (per-entity).
- `SavedView` (per-user filter/sort/group config).
- `AutomationRule` (trigger + condition + action).
- `ContactMessage`: `status`, `assigneeId`, `priority`, `slaDueAt`, reply thread.
- `Royalty` / `Split` / `Payout`, `Agreement`.
- `ReleaseChecklist` / `ChecklistTemplate`, `Approval`.
- `Asset` (DAM), `Placement`, `Demo` (A&R), `NewsletterCampaign`.
- `Role` / `Permission` (granular), `AuditEvent`.

---

*Last updated: 2026-07-01. No implementation started — awaiting selection of the first
phase to build.*
