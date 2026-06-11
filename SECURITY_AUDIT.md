# Security Audit — Oscillation Records

**Date:** 2026-06-11
**Scope:** Static review of the full Next.js application (App Router) — all API routes, NextAuth configuration, middleware, Prisma schema, and build config. No dynamic/penetration testing was performed (app was not running).
**Original verdict:** **Not safe to expose publicly.** There was a systemic broken-access-control problem: most data-mutating API endpoints and all S3 upload-URL endpoints had **no authentication or authorization**. Anyone on the internet could rewrite or delete the entire catalog and obtain write access to the S3 bucket.

---

## ✅ Remediation applied (2026-06-11)

All findings below have been fixed in code. Summary of changes:

- **New shared guards** `lib/auth-guard.ts` (`requireAdmin`, `requireUser`, `isAdminRequest`, `tokenIsAdmin`) — single source of truth for the admin check, replacing the `ADMIN_EMAIL` constant that had been copy-pasted into ~10 files.
- **CRITICAL writes locked down:** admin auth added to every catalog/upcoming-release mutation (`artists`, `releases`, `releases/[id]`, `releases/[id]/tracks`, `tracks/[id]`, `upcoming-releases`, `upcoming-releases/[id]`).
- **Uploads locked down** via new `lib/s3.ts` (centralized client/config + `sanitizeKey`, content-type checks, `isOwnBucketUrl`):
  - `presigned-url-image` and `presigned-urls-bulk` → **admin only**, keys sanitized.
  - `presigned-urls` → **authenticated users**; non-admins confined to the `benert-remix/` prefix and audio-only (so the public remix competition still works); admins retain full catalog/stem uploads. Keys sanitized.
- **HIGH PII leak fixed:** `analytics/dashboard` and `analytics/content/[id]` are now **admin only** (were any-logged-in-user).
- **OAuth token leak fixed:** the `session` callback no longer copies `accessToken`/`refreshToken`/`expiresAt` to the client; the `/auth-test` debug page (which printed the whole session) was deleted.
- **Stored-URL validation:** `benert-remix/upload-complete` now rejects any `fileURL` not on our own S3 bucket.
- **Security headers** added in `next.config.ts`; `http` image remote pattern dropped (https only).
- **Rate limiting** (`lib/rate-limit.ts`) added to the public `newsletter` endpoint.
- **Dependency cleanup:** removed unused `bcrypt`, `bcryptjs`, `@types/bcrypt`, `@types/bcryptjs`, `aws-sdk` (v2), `multer`, `@types/multer`, `@google-cloud/local-auth`.

The findings below are retained as the record of what was found and why. Each is now addressed.

---

## Root cause

`middleware.ts` only matches **pages**, not the API:

```ts
export const config = {
  matcher: ["/admin/:path*", "/benert-remix/admin/:path*"],
};
```

The admin UI is gated by this middleware, which protects the *browser pages*. But the API routes those pages call are **not** under the matcher, so they are reachable directly (e.g. `curl`) with no session. Some routes were given their own in-handler admin checks (everything under `/api/admin/*`, the `benert-remix` admin/user routes), but the core catalog and upload routes were not. The result is an inconsistent, mostly-open API.

---

## CRITICAL — Unauthenticated write/delete across the catalog & uploads

None of the following check a session. Each is fully usable by an anonymous request.

| Endpoint | Methods | File |
| --- | --- | --- |
| `/api/artists` | POST | [app/api/artists/route.ts:54](app/api/artists/route.ts#L54) |
| `/api/artists/[artistId]` | PUT, PATCH, DELETE | [app/api/artists/[artistId]/route.ts:40](app/api/artists/[artistId]/route.ts#L40) |
| `/api/releases` | POST | [app/api/releases/route.ts:167](app/api/releases/route.ts#L167) |
| `/api/releases/[releaseId]` | PATCH, DELETE | [app/api/releases/[releaseId]/route.ts:180](app/api/releases/[releaseId]/route.ts#L180) |
| `/api/releases/[releaseId]/tracks` | POST | [app/api/releases/[releaseId]/tracks/route.ts:9](app/api/releases/[releaseId]/tracks/route.ts#L9) |
| `/api/tracks/[trackId]` | PATCH, DELETE | [app/api/tracks/[trackId]/route.ts:43](app/api/tracks/[trackId]/route.ts#L43) |
| `/api/upcoming-releases` | POST | [app/api/upcoming-releases/route.ts:54](app/api/upcoming-releases/route.ts#L54) |
| `/api/upcoming-releases/[releaseId]` | PATCH, DELETE | [app/api/upcoming-releases/[releaseId]/route.ts:25](app/api/upcoming-releases/[releaseId]/route.ts#L25) |
| `/api/upload/presigned-urls` | POST | [app/api/upload/presigned-urls/route.ts:24](app/api/upload/presigned-urls/route.ts#L24) |
| `/api/upload/presigned-urls-bulk` | POST | [app/api/upload/presigned-urls-bulk/route.ts:24](app/api/upload/presigned-urls-bulk/route.ts#L24) |
| `/api/upload/presigned-url-image` | POST | [app/api/upload/presigned-url-image/route.ts:23](app/api/upload/presigned-url-image/route.ts#L23) |

**Note:** `releases` and `tracks` *import* `getToken`, but only to decide whether to reveal private fields like `upcCode` in GET responses — it is never used to gate writes.

### Impact

- **Catalog tampering / vandalism:** anyone can create, edit, or delete artists, releases, and tracks.
- **Destructive cascade:** `DELETE /api/artists/[id]` walks related tracks/releases and deletes releases when an artist is the sole primary ([app/api/artists/[artistId]/route.ts:179-245](app/api/artists/[artistId]/route.ts#L179-L245)). A single unauthenticated call can wipe large parts of the catalog. `PATCH /api/releases/[id]` with `tracks: []` clears all tracks.
- **S3 abuse (the most dangerous):** the presigned-URL endpoints take an attacker-supplied `Key` (filename) and `ContentType` and return a valid S3 `PutObject` URL ([app/api/upload/presigned-urls/route.ts:54-61](app/api/upload/presigned-urls/route.ts#L54-L61)). With no auth, an anonymous user can:
  - upload arbitrary files of arbitrary size/type into the bucket (cost/storage abuse, potential malware hosting on the label's domain),
  - **overwrite existing objects** by reusing a known key (replace real song audio or cover art),
  - the key is used verbatim with no prefix/sanitization, so paths are fully attacker-controlled.

### Fix

Add an authorization check to every mutating handler, mirroring the pattern already used in `/api/admin/*`:

```ts
import { getToken } from "next-auth/jwt";
const ADMIN_EMAIL = "oscillationrecordz@gmail.com";

const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
if (!token?.email || token.email !== ADMIN_EMAIL) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Better: centralize it (e.g. a `requireAdmin(request)` helper) and call it at the top of each protected handler so the check can't drift. For the presigned-URL routes, also constrain the `Key` to a server-generated prefix and validate `ContentType` against an allowlist (audio/image only).

---

## HIGH — PII / analytics exposed to any logged-in user (not just admin)

`GET /api/analytics/dashboard` and `GET /api/analytics/content/[contentId]` check only `if (!token)` — i.e. **any authenticated Google account**, not the admin. The sign-in flow lets *anyone* with a Google account log in (there is no `signIn` allowlist), so this is effectively exposed to the world-with-a-Google-login.

- Dashboard returns `recentPlays` including each user's name/email ([app/api/analytics/dashboard/route.ts:183-191](app/api/analytics/dashboard/route.ts#L183-L191)). The comment even says "Check if user is admin" but the code doesn't.
- Content analytics returns `userEngagement` with **email, gender, ageRange, country, city** per user, plus `topUsers` ([app/api/analytics/content/[contentId]/route.ts:185-219](app/api/analytics/content/[contentId]/route.ts#L185-L219)).

### Impact

Any random signed-in user can enumerate every user's email address and demographic profile — a privacy breach and likely a GDPR/data-protection violation.

### Fix

Gate both endpoints on `token.email === ADMIN_EMAIL` (same helper as above).

---

## HIGH — Google OAuth tokens (including the refresh token) exposed to the browser

The session callback copies the Google `accessToken` **and `refreshToken`** onto the session object returned to the client ([lib/auth.ts:116-127](lib/auth.ts#L116-L127), typed in [types/next-auth.d.ts:8-11](types/next-auth.d.ts#L8-L11)). NextAuth serves the session to client JavaScript via `/api/auth/session`, so these land in the browser. The leftover debug page `/auth-test` even renders the whole session (tokens included) as JSON on screen ([app/auth-test/page.tsx:28-30](app/auth-test/page.tsx#L28-L30)).

Refresh tokens are long-lived and must never reach the client. Any XSS, browser extension, or shoulder-surf of `/auth-test` discloses a durable Google credential for that user (scope `openid email profile`).

### Fix

Remove `accessToken`/`refreshToken` from the `session` callback (keep them only in the encrypted JWT, server-side). Delete `/auth-test`. If the client genuinely needs the access token for a Google API call, expose only the short-lived access token, never the refresh token.

---

## MEDIUM — `benert-remix/upload-complete` stores an unvalidated, client-supplied URL

`POST /api/benert-remix/upload-complete` saves whatever `fileURL` string the client sends, with no check that it points to the project's S3 bucket ([app/api/benert-remix/upload-complete/route.ts:34-86](app/api/benert-remix/upload-complete/route.ts#L34-L86)). The admin list then surfaces that URL ([app/api/benert-remix/admin/route.ts:32-38](app/api/benert-remix/admin/route.ts#L32-L38)). A user can submit an arbitrary/malicious link that the admin may click.

### Fix

Validate `fileURL` starts with the expected `https://<bucket>.s3.<region>.amazonaws.com/` origin before storing.

---

## MEDIUM — No security headers; wildcard image hosts

`next.config.ts` sets no security headers — no `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, or `Referrer-Policy` ([next.config.ts:1-19](next.config.ts#L1-L19)). It also allows images from any host over both `http` and `https` (`hostname: "**"`). With `unoptimized: true` the open-proxy risk is reduced, but the missing headers leave the app open to clickjacking and reduce defense-in-depth against XSS.

### Fix

Add a `headers()` block (or middleware) setting the headers above; restrict `remotePatterns` to the S3 bucket and any other hosts you actually use; drop the `http` pattern.

---

## MEDIUM — No rate limiting / abuse controls

No endpoint is rate-limited. Most exposed:

- `POST /api/newsletter` — unauthenticated; can be scripted to flood the `NewsletterSubscriber` table ([app/api/newsletter/route.ts:10](app/api/newsletter/route.ts#L10)).
- the presigned-URL routes (storage/cost abuse, compounding the CRITICAL above).
- `POST /api/analytics/track-play` — any user can inflate play counts.

### Fix

Add IP/identity-based rate limiting (e.g. Upstash Ratelimit, or platform WAF rules) on public/abuse-prone endpoints.

---

## LOW — Authorization model is fragile

- `ADMIN_EMAIL = "oscillationrecordz@gmail.com"` is hardcoded and duplicated in ~8 route files plus `lib/auth-session.ts`. Easy to forget one (already the case). Move to a single exported constant / env var and a shared `requireAdmin` helper.
- The Prisma adapter is disabled with a "Temporarily disabled to fix session issues" comment ([lib/auth.ts:51](lib/auth.ts#L51)); sessions are JWT-only. Workable, but means there's no server-side session revocation.
- No role model in the schema — admin is "this one email." A `role` field on `User` would scale better and enable real revocation.

---

## LOW — Dependency hygiene / supply-chain surface

`package.json` carries packages that appear unused by the app (only Google OAuth via NextAuth is wired up):

- `bcrypt` **and** `bcryptjs` (plus `@types/*`) — no password auth exists.
- `aws-sdk` (v2, in maintenance mode) alongside the v3 `@aws-sdk/*` clients actually used.
- `multer`, `@types/multer`, `@google-cloud/local-auth` — no server upload handler / local-auth flow in the code.

Remove unused deps to shrink the install and audit surface. Run `npm audit` once dependencies are installed and address any high/critical advisories.

---

## Things that are done correctly (worth keeping)

- `/api/admin/*` routes and the `benert-remix` admin/user routes all enforce auth properly — that's the pattern to copy everywhere.
- `PATCH /api/analytics/play-event/[id]` correctly scopes updates to the caller's own user (`where: { id, userId: user.id }`) — no IDOR ([app/api/analytics/play-event/[id]/route.ts:32-38](app/api/analytics/play-event/[id]/route.ts#L32-L38)).
- Routes destructure specific fields rather than spreading the request body, avoiding mass-assignment.
- MongoDB access goes through Prisma with parameterized queries — no SQL/NoSQL injection seen.
- `.env*` is gitignored; `test-prisma.js` contains no hardcoded secrets.
- Error responses are generic; stack traces aren't returned to clients.

---

## Suggested remediation order

1. **Lock down the CRITICAL write/upload routes** (add `requireAdmin`) — this is the urgent one.
2. **Admin-gate the two analytics read routes** (HIGH PII leak).
3. **Stop sending OAuth tokens to the client** and delete `/auth-test`.
4. Validate stored URLs in `upload-complete`; add security headers; tighten `remotePatterns`.
5. Add rate limiting; centralize the admin check; prune unused dependencies.
