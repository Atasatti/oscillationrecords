# Admin / Ops Feature Plan

A consolidated backlog of every feature idea raised for the admin area — the Tasks view
plus the wider label-operations tooling. Benchmarked against **Atera** (ticketing,
automation, SLAs, dashboards) and **Notion** (flexible databases, views, relations,
templates), then extended with label-specific operations.

It's the menu we pick from, sequenced so each build makes the next one easier.
**Several items are now shipped — see "Shipped so far" below; the roadmap tables mark
done items with ✅.**

> **Design principle:** don't rebuild Atera or Notion. Cherry-pick the handful of patterns
> that fit a small independent label and connect the data we already store.

---

## Shipped so far (2026-07 · local branch `admin-press-errors-page-media`, unpushed)

Built in the plan's recommended order (assignees → roles+audit → relations → verticals):

- ✅ **#1 Assignees + My tasks** — inline avatar picker + assignee filter (`OutreachTask.assigneeId`).
- ✅ **#2/#3/#5/#6/#7 Task depth** — recurring tasks, checklists (+progress %), bulk actions, per-task comments, S3 attachments.
- ✅ **#18 Message inbox → tickets** — `ContactMessage` gains status/assignee/priority + status filters (`handled` kept in sync) + an internal reply/notes thread per ticket (`MessageReply`).
- ✅ **#23/#38 Notifications + @mentions** — topbar bell (overdue/due-today tasks + unread mentions); @mention a teammate in a task comment.
- ✅ **New/Edit task dialog rework** — 2-col, viewport-capped, pinned header/footer + scroll body (no longer overflows the screen).
- ✅ **#36 Granular roles + permissions** — Owner + Catalog / Outreach / Analytics / Read-only, enforced across ~44 routes + middleware page-gating + role-filtered sidebar.
- ✅ **#37 Audit log** — `AuditLog` model + owner-only viewer at `/admin/audit`; logs role changes and catalog/outreach create·update·delete.
- ✅ **#8–10 Relations + rollups** — task↔release/artist linking (chips) + tasks / pitches / press rollup panels on the release & artist **editors**.
- ✅ **#28 Release pipeline** — schedule board at `/admin/catalog/pipeline`.
- ✅ **#24 Royalty & split tracking (+ #27 payouts)** — per-release splits → revenue → owed → payouts → outstanding, plus a cross-release "who's owed" rollup at `/admin/catalog/royalties`.
- ✅ **#20 Ops dashboard** — tasks / pipeline / royalties overview cards on `/admin`.

Also fixed two **Needs-attention** bugs (false "needs a release"; duplicate artist rows).

**Deviation:** a metadata "readiness" panel + delivery/sign-off checklist (#30) was built,
then **removed** — it duplicated the existing release SEO score.

**Data note:** implemented as `Release.splits` / `revenue` / `payments` (JSON) + `User.role`
scoped roles + `AuditLog` — not the fuller `Royalty`/`Split`/`Payout` models originally
sketched below (JSON-on-Release was enough for a small catalog).

---

## What already exists

*Baseline (pre-July 2026):*
- **Tasks** (`/admin/tasks`): List + Calendar views, "Needs attention" tab, suggested
  tasks, categories, priorities with auto-sort, todo/in-progress/done, due dates + overdue,
  create/edit/delete, client caching.
- **Outreach** (`/admin/outreach`): Contacts (mini-CRM) + Pitch tracker (`PitchLog`).
- **Messages** (`/admin/messages`): inbound contact form → `ContactMessage` (`handled` boolean only).
- **Catalog**: Releases (with `upcCode`, `catalogueNumber`, `isrcCode`, `pLine`, `cLine`,
  `credits` JSON), Artists (`wikidataId`, `wikipediaUrl`), Press.
- **Subscribers**, **Live data** (audience analytics: `PlayEvent`, `LinkClick`), **Errors**.
- Per-release/artist **SEO score** (`lib/seo-score.ts`) — completeness/discoverability signal.

*Added July 2026 (this session — see "Shipped so far"):*
- **Tasks**: assignees + "My tasks", links to releases/artists (chips).
- **Roles**: granular Owner + scoped roles (was coarse admin/user), enforced server + client.
- **Audit log** (`/admin/audit`), **Pipeline** (`/admin/catalog/pipeline`),
  **Royalties** (`/admin/catalog/royalties`), **Ops overview** on the dashboard.
- Release **editors** now carry royalties + tasks/pitches/press rollup panels.

Two instincts already in the codebase and still worth deepening:
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
| 1 | ✅ **Assignees + "My tasks"** | S–M | **Shipped.** `assigneeId` + inline avatar picker + assignee filter. |
| 2 | ✅ **Recurring tasks** | M | **Shipped.** "Repeat" select (`recurrence`); regenerates the next occurrence on completion. |
| 3 | ✅ **Subtasks / checklists** | S | **Shipped.** Per-task checklist with done-state + progress %. |
| 4 | ✅ **Blocked / waiting status** | S | **Shipped.** `blocked` added to the task status enum (`lib/task-status.ts`) — its own kanban column + status pill. |
| 5 | ✅ **Bulk actions** | S | **Shipped.** Multi-select checkboxes + toolbar (bulk delete). |
| 6 | ✅ **Comments (per task)** | M | **Shipped.** Comment thread (`TaskComment`) + @mentions (#38). |
| 7 | ✅ **Attachments** | S | **Shipped.** S3 file attachments on a task. |

### Phase 2 — Connect the data (Notion relations)
The single highest-leverage architectural change. Everything downstream gets better.

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 8 | ✅ **Relations + rollups** | L | **Shipped.** Task↔release/artist linking (chips) + rollup panels on the editors. |
| 9 | ✅ **Per-release rollup view** | M | **Shipped.** Release editor shows its tasks (progress %), pitches, press. |
| 10 | ✅ **Per-artist rollup view** | M | **Shipped.** Artist editor shows linked tasks, pitches, press. |
| 11 | ✅ **Grouping (by assignee / release / category)** | S | **Shipped.** First-class group-by on the Tasks list (none / assignee / release / category), partitioned under section headers; persists in saved views. |

### Phase 3 — Views & flexibility (Notion)
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 12 | ✅ **Board (kanban) view** | M | **Shipped.** Status columns (To&nbsp;Do / In&nbsp;Progress / Blocked / Done) + HTML5 drag-to-move on the Tasks page (List/Calendar still available). |
| 13 | ✅ **Timeline / Gantt view** | M | **Shipped** as a release timeline at `/admin/catalog/timeline` — scheduled + recent releases on a month-grouped rail with a Today marker. |
| 14 | ✅ **Saved views** | M | **Shipped.** Named per-user snapshots of the Tasks tab / filters / group-by / layout (`SavedView` model), applied from a "Views" bar. |
| 15 | ✅ **Custom properties** | M | **Shipped** as freeform task **tags** (`OutreachTask.tags`) — chip input in the editor, tag chips on rows, and a tag filter. |
| 16 | ✅ **Templates** | M | **Shipped.** Reusable task templates (`TaskTemplate`) — build a named set of tasks, apply in one click. Manager at `/admin/outreach/templates`. |

### Phase 4 — Automation & inbox (Atera)
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 17 | ◑ **Automation rules ("when X → do Y")** | L | **Shipped (2 rules)** at `/admin/automations`: pitch Accepted → follow-up task (event); scheduled release within N days → pre-release campaign task (run via "Run now"/cron). Extensible registry (`lib/automations.ts`) + idempotent fire ledger. More triggers/actions can be added. |
| 18 | ✅ **Unified Inbox / ticketing** | M–L | **Shipped.** `ContactMessage` → status + assignee + priority + status filters, plus an internal reply/notes thread per ticket (`MessageReply`). |
| 19 | **SLA / response targets** | M | "Respond within N days" on inbound + pitch follow-ups; flag breaches. |
| 20 | ✅ **Ops dashboard ("Today / This week")** | M | **Shipped.** Tasks / pipeline / royalties overview cards on `/admin` (each 403-gated). |
| 21 | ✅ **Smarter alert thresholds** | M | **Shipped.** Needs-attention now flags imminent scheduled releases missing artwork/tracks, pitches sent 14+ days ago with no follow-up set, and artists idle 6+ months. |
| 22 | ✅ **Reminders / daily digest** | M | **Shipped.** In-app reminders via the bell (#23) + an email **daily digest** at `/admin/digest` (open messages, draft/upcoming releases, demos to review, recent wins). Live preview; any staff can self-test, owners send to all; cron-schedulable. Behind a graceful "email not configured" gate. |
| 23 | ✅ **Notifications center (in-app bell)** | S–M | **Shipped.** Topbar bell surfaces overdue/due-today tasks + unread @mentions. |

### Phase 5 — Money & rights (biggest label-specific gap)
Nothing in the current admin covers this. Highest business value.

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 24 | ✅ **Royalty & split tracking** | L | **Shipped.** `Release.splits`/`revenue`/`payments` → owed/paid/outstanding + cross-release rollup at `/admin/catalog/royalties`. |
| 25 | ✅ **Campaign budget & spend** | M | **Shipped.** Per-release budget target + spend-by-category (`Release.budget`/`spend`), a budget panel on the editor + a cross-release rollup at `/admin/catalog/budgets`. |
| 26 | ✅ **Agreements / terms store** | M | **Shipped.** Per-release licensing terms (type, territory, rights, term dates, notes) on the editor (`Release.terms`); expiring agreements feed needs-attention. |
| 27 | ✅ **Invoicing / payout statements** | M | **Shipped.** Payouts/outstanding tracked (#24) + downloadable per-artist statement CSVs (and an all-payees export) on the royalties page. |

### Phase 6 — Release operations
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 28 | ✅ **Release pipeline** | M | **Shipped** as the schedule board at `/admin/catalog/pipeline` (scheduled + drafts). The *distribution checklist* half was built then removed (dup of SEO score — see #30). |
| 29 | ✅ **Asset library (DAM)** | M–L | **Shipped** at `/admin/catalog/assets`: S3-backed store for masters, artwork, stems, press photos, EPKs, linked to releases/artists. Grid + thumbnails, category filter + search, multi-file upload (per-file progress), edit, delete (removes the S3 object). Presigned uploads reuse `lib/s3.ts`; server-owned keys, SVG/HTML-excluded MIME allowlist re-checked on a post-upload HEAD, 1GB cap. |
| 30 | ✗ **Approval / sign-off gate** | S–M | Built (delivery checklist + "signed off"), then **removed** — duplicated the SEO score. Revisit only if a *distinct* workflow (delivered-to-DSP etc.) is wanted. |

### Phase 7 — A&R & artists
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 31 | ✅ **Demo / A&R pipeline** | M | **Shipped** at `/admin/outreach/demos`: log inbound demos (artist, contact, link, genre, source), rate 1–5 stars, move through Received → Reviewing → Offer → Signed/releasing / Passed. Stage tabs + counts, inline quick-edits, CRUD API (outreach-gated + audited, http(s)-only link). |
| 32 | **Artist onboarding checklist** | S–M | On add-artist: collect bio, photos, ISNI/IPI/MusicBrainz IDs, payout details. |

### Phase 8 — Marketing & reach
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 33 | ✅ **Placement tracker** | M | **Shipped** at `/admin/outreach/placements`: an internal wins log — playlist adds (+ reach), radio spins, press/blog coverage — with outlet, playlist/show/article, date, and optional release/artist links. Type filter + combined-reach headline. CRUD API (outreach-gated + audited). Distinct from the public Press feature. |
| 34 | ✅ **Content / social calendar** | M | **Shipped** at `/admin/content/calendar`: a month-grid calendar of planned posts (click a day to plan, a post to edit). Platform-tagged (colour-coded), status funnel (Idea → Drafted → Scheduled → Published), optional release link, per-platform month filter. UTC-pinned dates + local "today". CRUD API (outreach-gated + audited). |
| 35 | ✅ **Newsletter campaigns** | M–L | **Shipped** at `/admin/outreach/newsletter`: composer (subject + body w/ live preview), draft/schedule/send-now over the `NewsletterSubscriber` list, delivery + open-rate stats. Provider-agnostic send (Resend REST, no SDK dep) behind a graceful "email not configured" gate; cron-schedulable. Open tracking shipped; click tracking is a future add. |

### Phase 9 — Team & security *(pairs with the current security audit)*
| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 36 | ✅ **Granular roles + permissions** | M | **Shipped.** Owner + Catalog / Outreach / Analytics / Read-only, enforced across ~44 routes + middleware + sidebar. |
| 37 | ✅ **Admin activity / audit log** | M | **Shipped.** `AuditLog` + viewer at `/admin/audit`; logs role changes + catalog/outreach CRUD. |
| 38 | ✅ **@mentions** | S | **Shipped.** Mention a teammate in a task comment → surfaced in the notifications bell. |

---

## Explicitly dropped
- **AI copilot** (draft pitches/bios/blurbs) — considered and **rejected** by the label.

---

## Recommended starting order — ✅ followed & complete

1. ✅ **Assignees (#1)**
2. ✅ **Roles + audit log (#36, #37)**
3. ✅ **Relations + rollups (#8–10)** — the structural leap.
4. ✅ **Both verticals shipped:** Release pipeline (#28) *and* Royalty & split tracking (#24).
5. ✅ Bonus: Ops dashboard (#20).

### Suggested next (not yet started)
- **Small task wins (S):** ✅ blocked/waiting status (#4) + first-class group-by (#11) shipped.
- **Views (Notion):** ✅ Phase 3 complete — kanban #12, timeline #13, saved views #14, custom properties #15, templates #16 all shipped.
- **Automation & inbox:** SLA targets (#19 — redundant with #21). *(automation rules #17, ticketing+reply thread #18, smarter alerts #21, email digest #22 shipped.)*
- **Money:** ✅ Phase 5 complete — royalties (#24), budgets (#25), agreements/terms (#26), statements (#27) all shipped.
- **Everything actionable is shipped.** Remaining: artist onboarding (#32 — redundant with the artist editor's completeness signals) and SLA targets (#19 — redundant with #21). *(This run: A&R demo #31, content calendar #34, placements #33, asset library/DAM #29, newsletter #35, daily digest #22.)*
- **Email note:** #35/#22 ship behind a graceful gate. To enable sending, set `RESEND_API_KEY` + `EMAIL_FROM` (and optionally `CRON_SECRET` + a cron hitting `/api/newsletter/campaigns/run` and `/api/admin/digest`).

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

*Last updated: 2026-07-02. Shipped (local/unpushed on `admin-press-errors-page-media`):
#1, #2, #3, #5, #6, #7 (task depth), #8–10 (relations), #18 (inbox — reply thread pending),
#20, #23, #24 (+#27 partial), #28, #36, #37, #38 (+ New/Edit task dialog rework).
#30 built then removed.*
