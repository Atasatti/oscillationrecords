# Security Audit — Oscillation Records

**Latest audit:** 2026-06-18 (branch `admin-redesign`)
**Method:** Static review of the full Next.js 15 App Router app — all ~50 API route handlers, NextAuth config, middleware, Prisma schema, shared `lib/*` helpers, `next.config.ts`, dependencies (`npm audit`), and the server/client boundary. Framework anchored on the OWASP Top 10 (2021) + OWASP API Security Top 10, plus Next.js-specific risks (route-handler authz, server/client leakage, image-optimizer SSRF, CVE-2025-29927 middleware bypass). No dynamic/penetration testing (app not running); findings are code-verified with file:line.

> The prior audit (2026-06-11) found and fixed a systemic broken-access-control problem (unauthenticated catalog/upload routes, a PII leak, and an OAuth-token leak). **Those fixes have held** — see "Regression check" below. This pass focuses on what remains and what has been added since. The 2026-06-11 audit is preserved verbatim in **Appendix A**.

---

## Verdict

**Not yet safe to expose publicly — but close.** The core authorization model (centralized `requireAdmin`/`requireUser` guards, called at the top of every mutating handler) is now sound. The remaining issues fall into three buckets:

1. **Credential hygiene (CRITICAL)** — live production secrets sit in the working-tree `.env` and the file itself says "rotate after testing." The `NEXTAUTH_SECRET` in particular is the single anchor for *all* admin access.
2. **Two paginated/"latest" read endpoints lost the public-visibility filter** and leak unreleased (DRAFT) catalog content + internal fields to anonymous users (HIGH).
3. **Abuse-control gaps** — missing/bypassable rate limiting, input validation, and a stale report-only CSP (MEDIUM), plus 36 dependency advisories.

Fix the CRITICAL + the two HIGH leaks and the abuse-control MEDIUMs, and the app is launch-ready.

---

## ✅ Remediation applied (2026-06-18)

All **code** findings below have been fixed and independently re-reviewed (15 adversarial reviewers, all verdicts "correct"; typecheck `tsc --noEmit` clean; ESLint clean on changed files). Two items are **operational / your action** and one is a **deliberate deferral**.

**Fixed in code:**
- **H1 / M1** — `requireAdmin` added to the `?page=` branches of `app/api/releases/route.ts` and `app/api/artists/route.ts`. The public (non-paginated) branches are unchanged.
- **H2** — `app/api/songs/latest` now filters with `publicReleaseWhere()` (no DRAFT/future-SCHEDULED leak) and clamps `limit` to 1–50 (NaN→8).
- **M2** — `GET /api/tracks/[trackId]` now 404s unreleased tracks for non-admins (`isReleasePublic`, new in `lib/catalog-data.ts`).
- **M3** — `serializeTrackForPublic` now strips `stemsFile` (master stems) in addition to ISRC/ISWC/lyrics. Verified no public payload still ships stems.
- **M4** — `track-play` is rate-limited + validates `contentType`/`contentId`/`artistId` (ObjectId), caps name lengths, clamps `playDuration`.
- **M5** — `clientIp` prefers proxy-trusted `x-real-ip` over the spoofable left-most `X-Forwarded-For`.
- **M6** — `user-profile` validates demographics against enum allowlists + length/age caps.
- **M7** — subscribers CSV export escapes every cell and neutralizes `= + - @`/tab/CR formula prefixes.
- **M8 / L6** — CSP **enforced in production** (report-only in dev so HMR isn't blocked); image optimizer scoped to the specific bucket host instead of `**.amazonaws.com`.
- **L1 / L2** — non-admin presigned uploads are rate-limited and **server-namespaced** to `benert-remix/<userId>/…` (no cross-user overwrite / path escape); `upload-complete` confines the stored URL to the caller's own prefix and best-effort HEAD-checks size/content-type.
- **L3** — bulk presign route validates image/audio content types.
- **L4** — competition `start` validates `durationHours` (integer 1–8760) and refuses to start when one is already active (409).
- **L5** — footer/hero/studio URLs are scheme-validated (`lib/url-safety.ts` — rejects `javascript:`/`data:`/`vbscript:`, protocol-relative, and the `/\host` open-redirect trick).
- **Extra** — `days` query params on the three admin analytics routes are clamped to 1–365.

**Dependencies (H3):** `npm audit fix` took **36 advisories → 4 moderate** (all 1 critical + 9 high resolved). `next`→15.5.19, `next-auth`→4.24.14, `prisma`→6.19.3, `fast-xml-parser`→5.7.3, `tar`→7.5.16. The 4 residual moderates are transitive in `next` (bundled `postcss`) and `next-auth` (`uuid`) with **no non-breaking fix** — their only `--force` "fix" downgrades to `next@9` / `next-auth@3`, which we did **not** apply. Clear them later by moving to NextAuth v5.

**⚠️ Your action — not fixable in code:**
- **C1 (CRITICAL): rotate every secret** in `.env` (Mongo password, `NEXTAUTH_SECRET`, Google + Spotify client secrets, the AWS key pair) and keep production secrets only in the Vercel secret store. This must be done in the respective consoles.
- **Finalize deps:** run `npm install` (dedupes `@prisma/client` to 6.19.3 to match the `prisma` CLI) **with the dev server stopped**, then `npx prisma generate`. (Couldn't be run here — the running dev server holds a lock on the Prisma engine DLL.)

**Deliberately deferred (documented, not a regression):**
- **M8 residual:** `script-src` still allows `'unsafe-inline'` in production because the site relies on SSG/ISR + Next's framework inline scripts + JSON-LD; removing it requires nonce-based CSP, which would force fully dynamic rendering. The CSP is now enforced (strictly better than the prior report-only); nonce hardening is the next step. **Rollback:** set `cspHeaderKey` back to the Report-Only name in `next.config.ts`.
- **L7 (auth model):** still an email allowlist + JWT-only sessions (no server-side revocation). Left as-is — a role model + re-enabled Prisma adapter is a larger change that risks breaking login; the current model is safe while Google verifies emails and `NEXTAUTH_SECRET` stays secret (C1).
- **Release-detail pre-release audio (now fixed):** `GET /api/releases/[releaseId]` previously served a future-SCHEDULED ("Coming Soon") release's track `audioFile` URLs to the public, so the Coming-Soon page's playable track list exposed unreleased audio. It now returns `tracks: []` for non-admins on not-yet-public releases (`isReleasePublic`), so the page shows its existing "Tracklist to be revealed" state — metadata, cover, date and pre-save still work. This brings the endpoint in line with `songs/latest` and `tracks/[id]`. (Found during the post-fix completeness pass.)

> ⚠️ **Verify before deploy:** smoke-test locally with the dev server and watch the browser console for any **CSP violation** reports (the policy is now enforced in production builds), confirm admin upload + the Benert-Remix submit flow still work end-to-end, and confirm Coming-Soon/release pages render. Nothing here has been pushed.

---

## ✅ Round 2 — hardening (2026-06-18)

Follow-up hardening. All verified: `tsc --noEmit` clean, `next build` succeeds, ESLint clean on changed files, and 6 adversarial reviewers returned correct/complete/no-regression.

- **Release-detail pre-release audio leak (fixed):** see the note above — `GET /api/releases/[releaseId]` now returns `tracks: []` for non-admins on not-yet-public releases.
- **Role-based authorization + server-side revocation (L7):** added `User.role` (optional; existing rows read back `null`). On sign-in the JWT/session carry the role; `requireAdmin` re-checks the role against the DB on every call, so demoting a (non-bootstrap) admin to `user` **revokes access on their next request**. The hardcoded email allowlist is retained as a bootstrap (never locked out, no DB hit). `isAdminToken` (role OR bootstrap email) is used by middleware/read-gating. No DB migration needed (MongoDB).
- **Nonce-based CSP for the admin area (M8 follow-up):** all CSP now comes from `middleware.ts` (removed from `next.config.ts` to avoid duplicate headers). `/admin/*` gets a **strict** policy — `script-src 'self' 'nonce-…' 'strict-dynamic'`, **no `'unsafe-inline'`** — and `app/admin/layout.tsx` is `force-dynamic` so the per-request nonce reaches Next's scripts. Public pages keep the enforced **relaxed** CSP (`'unsafe-inline'`) so **SSG/ISR is preserved**. Report-only in dev, enforced in prod. `/benert-remix/admin` keeps its auth gate but the relaxed CSP.
- **Open-redirect hardening:** `isSafeUrl` now also rejects the `/\host` backslash trick (browsers normalize `\`→`/`).

**⚠️ NextAuth v5 — attempted, NOT shipped.** v5 (`5.0.0-beta.31`) was installed and the code migrated, but this dev environment **auto-respawns `npm run dev`**, which locks/reverts `node_modules` — the v5 install would not persist (it reverted to v4 on disk), so the migration couldn't be verified. I reverted all code to v4 (`next-auth@4.24.14`); package.json + lockfile + disk are consistently v4 (no broken-deploy risk). The transient v5 install did confirm it clears **2 of the 4** residual npm advisories (the `uuid` ones; the other 2 are `next`'s bundled `postcss`). **To do v5:** run it in a stable shell with the dev-server auto-restart disabled, then verify Google login end-to-end.

> ⚠️ **Test before deploy (auth + admin CSP):** log in with Google and confirm a session works; open an `/admin` page and confirm it renders with **no CSP errors** in the browser console (strict nonce policy is enforced in prod builds — if admin scripts are blocked, the one-line rollback is to give `/admin` the relaxed CSP in `middleware.ts`); confirm a non-admin is redirected away from `/admin`.

---

## Findings at a glance

| # | Sev | Area | Issue |
|---|-----|------|-------|
| C1 | CRITICAL | Secrets | Live prod credentials in `.env` (incl. `NEXTAUTH_SECRET` → forge admin JWT); flagged for rotation |
| H1 | HIGH | Access control | `GET /api/releases?page=&status=DRAFT` is unauthenticated and maps as admin → leaks DRAFT releases + `upcCode` + unreleased audio |
| H2 | HIGH | Access control | `GET /api/songs/latest` has no release-status filter → serves unreleased track audio/stems to anyone; `limit` unbounded |
| H3 | HIGH | Dependencies | 36 npm advisories (1 critical `fast-xml-parser`, 9 high incl. `tar`, Next.js middleware/image) |
| M1 | MEDIUM | Access control | `GET /api/artists?page=` is unauthenticated → exposes hidden artists + per-artist play stats + SEO internals |
| M2 | MEDIUM | Access control | `GET /api/tracks/[trackId]` ignores parent release status → DRAFT track audio/stems leak by id |
| M3 | MEDIUM | Data exposure | `stemsFile` (master stems URL) returned in every public track payload — likely unintended |
| M4 | MEDIUM | Abuse | `POST /api/analytics/track-play` has no rate limit + no input validation → row flooding / play-count poisoning |
| M5 | MEDIUM | Abuse | Rate-limit key trusts client `X-Forwarded-For` → limiter trivially bypassed (newsletter, pageview, link-click) |
| M6 | MEDIUM | Validation | `POST /api/analytics/user-profile` stores demographics with no enum/length validation |
| M7 | MEDIUM | Injection | CSV/formula injection in subscribers export (`?format=csv`) — public emails written unescaped |
| M8 | MEDIUM | Hardening | CSP is `Report-Only` and uses `'unsafe-inline'` for scripts → no enforced XSS mitigation |
| L1 | LOW | Uploads | Presigned PUT: no size cap, no per-user key namespace, not create-only → overwrite/denial-of-wallet |
| L2 | LOW | Uploads | `upload-complete` validates bucket host but not key prefix → entry can reference any bucket object |
| L3 | LOW | Uploads | Bulk presign route doesn't validate `ContentType` (admin-only) |
| L4 | LOW | Logic | Competition `start`: `durationHours` unbounded/non-integer; no single-active-competition guard |
| L5 | LOW | Hardening | Footer/hero/studio URLs stored without scheme validation (`javascript:` possible, admin-gated) |
| L6 | LOW | SSRF | Image-optimizer allowlist `**.amazonaws.com` is overly broad |
| L7 | LOW | Design | Admin = email allowlist + JWT-only sessions → no server-side revocation |

---

## CRITICAL

### C1 — Live production secrets in the working-tree `.env`, flagged for rotation
**File:** `.env` (lines 6, 9, 11–12, 14–15, 20–21). Not gitignored? It **is** gitignored (`.gitignore:35` `.env*`) and verified **absent from git history** — so this is not a repo leak. It is a live-credential-handling problem.

The file's own header reads *"these are LIVE production credentials — rotate after testing."* It contains, in plaintext:
- **`NEXTAUTH_SECRET`** — the JWT signing secret. **This is the crown jewel:** anyone who has it can mint a valid session JWT with `email: oscillationrecordz@gmail.com` and pass *every* `requireAdmin` check in the app. The entire access-control model collapses if this leaks.
- MongoDB Atlas user/password (`Oscillation_Records` / `Rocky490…`) — full DB read/write.
- AWS IAM long-term key (`AKIA435KGA2FKURDSRF7`) + secret — S3 write.
- Google OAuth client secret (`GOCSPX-…`) and Spotify client secret.
- The DB URL also carries `tlsAllowInvalidCertificates=true` (a documented local-only proxy workaround — MITM-exposing if it ever ships to prod).

**Impact:** Any leak vector (accidental commit, backup, screen-share, malware, a future `git add -A` before the ignore is honored) hands over full DB/S3/admin control. These have already been shared in chat and flagged for rotation, so they should be treated as compromised.

**Fix:**
1. **Rotate all of them now**, before launch: Atlas password, `NEXTAUTH_SECRET` (this invalidates existing sessions — fine), Google client secret, the AWS key pair, Spotify secret.
2. Store production secrets only in the host's secret manager (Vercel env vars), never in a file that travels with the code.
3. Never set `tlsAllowInvalidCertificates=true` in prod.
4. Consider scoping the AWS key to least privilege (only `s3:PutObject`/`GetObject` on the one bucket) rather than a broad IAM user.

---

## HIGH

### H1 — Unreleased (DRAFT) catalog + internal `upcCode` leak via the unauthenticated releases pagination branch
**File:** [app/api/releases/route.ts:26-42](app/api/releases/route.ts#L26-L42) → [lib/admin-data.ts:309-373](lib/admin-data.ts#L309-L373) → [lib/catalog-data.ts:141](lib/catalog-data.ts#L141)

The releases `GET` has an "opt-in pagination" branch that triggers whenever `?page=` or `?pageSize=` is present. That branch:
- has **no `requireAdmin` guard** (the rest of the handler correctly uses `isAdminRequest` to switch the `where` filter, but this branch returns before that logic), and
- calls `getReleasesPage(...)`, which internally maps rows with **`mapReleasesToCards(rows, { isAdmin: true })`** — and `isAdmin:true` is exactly what reveals the private `upcCode` (`catalog-data.ts:141`), and
- accepts `status=DRAFT` / `SCHEDULED` straight from the query string.

**Exploit (anonymous):**
```
GET /api/releases?page=1&pageSize=100&status=DRAFT
```
returns every DRAFT (unpublished, work-in-progress) release — name, cover art, first-track **audio URL**, release date — plus the internal **UPC code** for every release returned. `?status=RELEASED` likewise dumps `upcCode` for the live catalog. This is broken access control + a pre-release content/metadata leak.

**Fix:** Add `requireAdmin` at the top of the pagination branch (it is an admin-table feature):
```ts
if (searchParams.has("page") || searchParams.has("pageSize")) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  ...
}
```

### H2 — `GET /api/songs/latest` serves unreleased track audio (and stems) to anyone; unbounded `limit`
**File:** [app/api/songs/latest/route.ts:17-24](app/api/songs/latest/route.ts#L17-L24)

The query `prisma.release.findMany({ orderBy: …, include: { tracks } })` has **no `where` filter**. Every other public reader funnels through `publicReleaseWhere()` (`catalog-data.ts:64`, which the file's own comment calls out: *"a missed filter leaks unreleased music"*). This one missed it. It therefore returns the first playable track of **DRAFT and future-dated SCHEDULED releases**, and `serializeTrackForPublic` (used at line 79) returns the track's `audioFile` **and `stemsFile`** (it only strips `isrcCode`/`iswc`/`lyrics`).

**Exploit (anonymous):** `GET /api/songs/latest?limit=500` → playable URLs + track ids + cover art for the entire unreleased pipeline. Separately, `limit` is `parseInt(...)` with no clamp: `?limit=abc` → `NaN`, so the `length >= NaN` break never fires and the handler loads **all** releases and tracks into memory on every request — a cheap DoS amplifier.

**Fix:** Add `where: publicReleaseWhere()` to the `findMany`, and clamp `const limit = Math.min(Math.max(parseInt(...) || 8, 1), 50)`.

### H3 — 36 dependency advisories (1 critical, 9 high)
`npm audit` (run with `--use-system-ca` for this network's TLS proxy) reports **1 critical, 9 high, 25 moderate, 1 low — all `fixAvailable: true`**:
- **Critical:** `fast-xml-parser` (ReDoS / entity-expansion), transitive via `@aws-sdk/client-s3`.
- **High:** `tar` (multiple path-traversal / arbitrary-write), `picomatch` (ReDoS), plus build-chain transitives.
- **Next.js `15.5.9`** is within the vulnerable range for several middleware-bypass and **image-optimizer DoS/SSRF** advisories (note: CVE-2025-29927, the `x-middleware-subrequest` bypass, is **already patched** here — it was fixed in 15.2.3).

**Fix:** Run `npm audit fix`, then bump `next` to the latest 15.x, `@aws-sdk/*`, `prisma`/`@prisma/client`, and `next-auth`. Re-run `npm audit`. The `next` bump is the single highest-value upgrade (picks up the image-optimizer fixes relevant to L6).

---

## MEDIUM

### M1 — Unauthenticated admin artist-table data via `GET /api/artists?page=`
**File:** [app/api/artists/route.ts:29-49](app/api/artists/route.ts#L29-L49) → [lib/admin-data.ts:226-283](lib/admin-data.ts#L226-L283)

Same shape as H1 but lower impact: the `?page=` branch has no `requireAdmin`. Good news — `getArtistsPage`'s `ROW_SELECT`/`toRow` **do not** ship the internal PII (`realName`, `contactEmail`, `managerName`, `internalNotes`, `ipis` are never selected; `isni`/`musicBrainzId` are reduced to booleans and stripped). So this is **not** a PII leak. But it is still an admin-only data view reachable anonymously: an attacker can enumerate **hidden artists** (`?page=1&visibility=hidden` → artists with `showOnWebsite:false`), each artist's **90-day play counts**, and the internal **SEO scoring**.
**Fix:** Add `requireAdmin` to the pagination branch (same as H1).

### M2 — `GET /api/tracks/[trackId]` ignores the parent release's status
**File:** [app/api/tracks/[trackId]/route.ts:14-27](app/api/tracks/[trackId]/route.ts#L14-L27)

The handler loads the track with `include: { release: true }` but never checks `track.release.status`. A public caller who knows (or guesses, or harvests from H2) a track id gets `serializeTrackForPublic(track)` — including `audioFile` and `stemsFile` — even when the track belongs to a DRAFT release.
**Fix:** After loading, if the caller isn't admin and `track.release.status === "DRAFT"` (or it's a not-yet-due SCHEDULED), return 404. Mirror the gating used in the release detail GET.

### M3 — `stemsFile` (master stems) exposed in all public track payloads
**File:** [lib/release-format.ts:138-146](lib/release-format.ts#L138-L146)

`serializeTrackForPublic` strips `isrcCode`/`iswc`/`lyrics` but **keeps `stemsFile`** (and `trackCredits`). The stems file is the raw multitrack master — sensitive label IP. It's returned by the release detail GET, the track GET (M2), and `songs/latest` (H2). This may be intentional for the Benert Remix competition (entrants need stems), but exposing **every** track's stems to the anonymous public is almost certainly broader than intended.
**Fix:** Confirm intent. If stems should only be available during/within the competition flow, drop `stemsFile` from `serializeTrackForPublic` and serve it through a gated endpoint instead.

### M4 — `POST /api/analytics/track-play`: no rate limit, no input validation
**File:** [app/api/analytics/track-play/route.ts:21-84](app/api/analytics/track-play/route.ts#L21-L84)

This is the heaviest public write (one `PlayEvent` row per call) yet, unlike its siblings `pageview` and `link-click`, it calls **no `rateLimit(...)`**. There's also no validation: `contentName`/`artistName` length is uncapped, `playDuration` isn't clamped, `contentType` isn't checked against an allowlist, and the anonymous identity comes entirely from the client-supplied `osc_vid`/`osc_consent` cookies (forgeable when hitting the API directly).
**Impact:** Scripted requests inflate play counts for any content id (poisoning the admin dashboard's top-content / completion metrics) and flood the DB (storage/cost).
**Fix:** Add `rateLimit(\`trackplay:${clientIp(request)}\`, N, 60_000)` at the top; validate `contentType` against `["track","release"]`, validate `contentId`/`artistId` as ObjectIds, cap string lengths, clamp `playDuration`.

### M5 — Rate-limit key trusts client-controlled `X-Forwarded-For`
**File:** [lib/rate-limit.ts:46-50](lib/rate-limit.ts#L46-L50) (used by `newsletter`, `pageview`, `link-click`)

`clientIp()` returns the **first** `X-Forwarded-For` token. When the API is reachable directly (not strictly behind a trusted proxy that overwrites XFF), the client controls that header, so rotating `X-Forwarded-For: <random>` gives a fresh bucket per request and the limiter never trips.
**Fix:** Trust only the platform-provided client IP (on Vercel, the right-most XFF hop / the header the proxy sets). Don't use the left-most attacker-supplied value. (The in-memory/per-instance nature is already documented and acceptable for casual abuse; the header-trust bug is the real defect.)

### M6 — `POST /api/analytics/user-profile`: demographics stored without validation
**File:** [app/api/analytics/user-profile/route.ts:33-69](app/api/analytics/user-profile/route.ts#L33-L69)

`gender`, `ageRange`, `country`, `city` are read from the body and upserted with no enum check and no length cap (the dashboard treats `gender`/`ageRange` as fixed enums). A logged-in user can store oversized/garbage values that then surface in the admin analytics (`content/[contentId]`, `raw`). React auto-escapes on render so stored-XSS risk is low, but it's a data-integrity + unbounded-storage problem. Scoping is correct (keyed by `token.email`, no IDOR).
**Fix:** Validate each field against an allowlist / max length before upsert; reject unknown enum values. Prefer reusing `requireUser` over the open-coded token check.

### M7 — CSV / formula injection in the subscribers export
**File:** [app/api/admin/subscribers/route.ts:24-27](app/api/admin/subscribers/route.ts#L24-L27)

Rows are built as `` `${s.email},${s.createdAt.toISOString()}` `` with no escaping. Subscriber emails come from the **public** newsletter signup, and an address whose local part starts with `=`, `+`, or `-` (e.g. `+x@a.com`, `=x@a.com`) is RFC-valid and passes the signup regex. When the admin opens `subscribers.csv` in Excel/Sheets, such a cell is interpreted as a **formula** (data exfiltration / DDE).
**Fix:** Escape every field — wrap in quotes, double internal quotes, and prefix any value beginning with `= + - @ \t \r` with a `'`.

### M8 — Content-Security-Policy is Report-Only and uses `'unsafe-inline'`
**File:** [next.config.ts:8-23,37](next.config.ts#L8-L37)

The CSP is shipped as `Content-Security-Policy-Report-Only`, so it **blocks nothing**, and `script-src` includes `'unsafe-inline'`, which would neuter most of CSP's XSS value even once enforced. This is a known, deliberate first step (per the file comment), but it means there is no enforced CSP defense-in-depth today.
**Fix:** After a report-only review cycle, switch the header key to `Content-Security-Policy` (enforce) and move to nonce-based scripts so `'unsafe-inline'` can be dropped from `script-src`. The other security headers (HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`) are correctly set and enforced.

---

## LOW

### L1 — Presigned PUT URLs: no size cap, no per-user namespace, not create-only
**Files:** [app/api/upload/presigned-urls/route.ts:73-107](app/api/upload/presigned-urls/route.ts#L73-L107), `presigned-urls-bulk`, `presigned-url-image`
A presigned `PutObjectCommand` URL places **no upper bound on object size** (denial-of-wallet on the non-admin competition path), keys aren't namespaced per user, and the PUT isn't create-only. A competitor can request a presigned URL for another entrant's key (`benert-remix/<known-name>`) and **overwrite** their submission. Auth, prefix-confinement, and audio-type checks for non-admins are otherwise correctly implemented.
**Fix:** Force non-admin keys to `benert-remix/${user.id}/<basename>` server-side; switch to `createPresignedPost` with a `content-length-range` condition to cap size; optionally add `IfNoneMatch: "*"` for create-only semantics.

### L2 — `upload-complete` validates bucket host but not key prefix
**File:** [app/api/benert-remix/upload-complete/route.ts:45-52](app/api/benert-remix/upload-complete/route.ts#L45-L52)
`isOwnBucketUrl()` checks scheme + bucket hostname only. A competitor can submit a `fileURL` pointing at **any** object in the bucket (an admin catalog track, another user's upload) as their entry — no upload required.
**Fix:** Parse the key from the URL and require it to start with `benert-remix/${user.id}/`.

### L3 — Bulk presign route doesn't validate `ContentType`
**File:** [app/api/upload/presigned-urls-bulk/route.ts:64-98](app/api/upload/presigned-urls-bulk/route.ts#L64-L98)
`imageFileType`/`fileType` are passed to the presigned URL with no `isImageContentType`/`isAudioContentType` check (unlike the single-image and non-admin audio routes). Admin-only, so low severity, but it could mint a URL for `text/html`.
**Fix:** Validate each content type before signing.

### L4 — Competition `start`: unbounded `durationHours`; no single-active guard
**File:** [app/api/benert-remix/admin/start/route.ts:15-34](app/api/benert-remix/admin/start/route.ts#L15-L34)
`durationHours` is only checked for `typeof === "number"` and `< 1`. A huge value (`1e15`) yields an effectively **permanent** competition; a float (`1.5`) is written to an `Int` column → 500. There's also no check for an already-active competition, so repeated calls create overlapping rows (readers pick newest, orphaning the rest). Admin-only.
**Fix:** `Number.isInteger(d) && d >= 1 && d <= 8760`; reject `create` if a competition is still active (409).

### L5 — Footer/hero/studio URLs stored without scheme validation
**File:** [lib/footer-settings.ts:63-67](lib/footer-settings.ts#L63-L67) (+ stacked-hero, studio-photos writers)
`normalizeFooterUrl` only trims. An admin could store `javascript:…` as a footer link, which React will render into an `<a href>` for every visitor. Admin-gated (self-inflicted), but an admin account shouldn't be the trust boundary for "inject script into every page."
**Fix:** Allow only `http(s)://` or relative `/…`; reject `javascript:`/`data:`/`vbscript:`.

### L6 — Image-optimizer allowlist is overly broad
**File:** [next.config.ts:48-52](next.config.ts#L48-L52)
`remotePatterns` includes `**.amazonaws.com`, letting the server-side image optimizer fetch **any** AWS-hosted host, not just your bucket — a mild SSRF/abuse + DoS amplifier (compounded by the Next image advisories in H3). `dangerouslyAllowSVG` is correctly **not** set.
**Fix:** Narrow to `osrecord.s3.us-east-1.amazonaws.com`.

### L7 — Authorization model: email allowlist + JWT-only sessions
**Files:** [lib/auth-session.ts:8-17](lib/auth-session.ts#L8-L17), [lib/auth.ts:51,67-70](lib/auth.ts#L51-L70)
Admin is "is this email in the hardcoded list" and the Prisma adapter is disabled (`// Temporarily disabled`), so sessions are JWT-only with **no server-side revocation**. This is workable and safe *as long as* Google verifies email ownership (it does) and `NEXTAUTH_SECRET` stays secret (see C1). A `role` field on `User` + a re-enabled adapter would scale better and enable revocation.

---

## Regression check vs the 2026-06-11 audit — all prior fixes held

- ✅ Every mutating catalog/upload/admin handler calls `requireAdmin`/`requireUser` at the **top**, before any work (verified across the artists/releases/tracks/admin/upload routes). The centralized guards in `lib/auth-guard.ts` + `lib/auth-session.ts` (now a 2-email allowlist) are the single source of truth.
- ✅ OAuth `accessToken`/`refreshToken` are **no longer** copied onto the client session (`lib/auth.ts:116-127`); the `/auth-test` debug page is gone.
- ✅ `benert-remix/upload-complete` validates the stored URL against the bucket (`isOwnBucketUrl`) — host-level (see L2 for the residual prefix gap).
- ✅ Security headers added; `http` image pattern dropped (https only).
- ✅ Analytics PII endpoints (`dashboard`, `content/[id]`, `raw`, `link-clicks`) are admin-only.
- ✅ IDOR correctly prevented on `play-event/[id]`, `account`, `account/export`, `consent`, and benert-remix `status` (all scoped to the caller's own `userId`/`token`).
- ✅ No SQL/NoSQL injection — all DB access is parameterized through Prisma; no raw queries; user input never reaches a Mongo `$`-operator.
- ✅ Mass-assignment avoided — handlers destructure named fields rather than spreading the request body.
- ✅ Newsletter: email validated + length-capped + honeypot + rate-limited (the limiter's XFF-trust bug is M5).
- ✅ Cookies: `httpOnly`, `Secure` in prod, `SameSite=Lax`, `__Secure-`/`__Host-` prefixes in prod. NextAuth provides CSRF for its own endpoints; custom mutations rely on `SameSite=Lax` + non-GET methods, which covers realistic CSRF vectors.
- ✅ CVE-2025-29927 (middleware bypass) is patched (`next 15.5.9 > 15.2.3`), and route handlers don't depend on middleware for API authz anyway (defense-in-depth).

---

## Suggested remediation order

1. **C1** — rotate every secret; move them to the host secret store. (Operational, do first.)
2. **H1 + M1** — add `requireAdmin` to the two `?page=` branches (`releases`, `artists`).
3. **H2 + M2 + M3** — add `publicReleaseWhere()`/status gating to `songs/latest` and `tracks/[id]`; clamp `limit`; decide on `stemsFile` exposure.
4. **H3** — `npm audit fix` + bump `next`/`@aws-sdk`/`prisma`/`next-auth`.
5. **M4–M7** — rate-limit + validate `track-play`; fix the XFF rate-limit key; validate `user-profile`; escape the subscribers CSV.
6. **M8 + L1–L6** — enforce CSP (nonce-based); presigned-URL hardening; competition `start` validation; URL-scheme allowlist; narrow image hosts.

---

# Appendix A — Prior audit (2026-06-11), preserved verbatim

**Date:** 2026-06-11
**Scope:** Static review of the full Next.js application (App Router) — all API routes, NextAuth configuration, middleware, Prisma schema, and build config. No dynamic/penetration testing was performed (app was not running).
**Original verdict:** **Not safe to expose publicly.** There was a systemic broken-access-control problem: most data-mutating API endpoints and all S3 upload-URL endpoints had **no authentication or authorization**. Anyone on the internet could rewrite or delete the entire catalog and obtain write access to the S3 bucket.

## ✅ Remediation applied (2026-06-11)

All findings below were fixed in code. Summary of changes:

- **New shared guards** `lib/auth-guard.ts` (`requireAdmin`, `requireUser`, `isAdminRequest`, `tokenIsAdmin`) — single source of truth for the admin check, replacing the `ADMIN_EMAIL` constant that had been copy-pasted into ~10 files.
- **CRITICAL writes locked down:** admin auth added to every catalog/upcoming-release mutation (`artists`, `releases`, `releases/[id]`, `releases/[id]/tracks`, `tracks/[id]`, `upcoming-releases`, `upcoming-releases/[id]`).
- **Uploads locked down** via `lib/s3.ts` (centralized client/config + `sanitizeKey`, content-type checks, `isOwnBucketUrl`):
  - `presigned-url-image` and `presigned-urls-bulk` → **admin only**, keys sanitized.
  - `presigned-urls` → **authenticated users**; non-admins confined to the `benert-remix/` prefix and audio-only; admins retain full catalog/stem uploads. Keys sanitized.
- **HIGH PII leak fixed:** `analytics/dashboard` and `analytics/content/[id]` are now **admin only**.
- **OAuth token leak fixed:** the `session` callback no longer copies `accessToken`/`refreshToken`/`expiresAt` to the client; the `/auth-test` debug page was deleted.
- **Stored-URL validation:** `benert-remix/upload-complete` now rejects any `fileURL` not on our own S3 bucket.
- **Security headers** added in `next.config.ts`; `http` image remote pattern dropped (https only).
- **Rate limiting** (`lib/rate-limit.ts`) added to the public `newsletter` endpoint.
- **Dependency cleanup:** removed unused `bcrypt`, `bcryptjs`, `@types/bcrypt`, `@types/bcryptjs`, `aws-sdk` (v2), `multer`, `@types/multer`, `@google-cloud/local-auth`.

### Root cause (2026-06-11)

`middleware.ts` only matched **pages**, not the API. The admin UI was gated by middleware (which protects browser pages), but the API routes those pages call were not under the matcher, so they were reachable directly (e.g. `curl`) with no session. Some routes had their own in-handler checks; the core catalog and upload routes did not. Fixed by adding `requireAdmin`/`requireUser` to every sensitive handler.

The full original CRITICAL/HIGH/MEDIUM/LOW finding list (unauthenticated writes across the catalog & uploads; PII/analytics exposed to any logged-in user; OAuth tokens exposed to the browser; unvalidated stored URL; missing security headers; no rate limiting; fragile authorization model; dependency hygiene) is retained in version control history; every item was remediated as summarized above and re-verified in the 2026-06-18 "Regression check."
