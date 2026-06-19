# Deployment runbook

Covers shipping the `admin-press-errors-page-media` branch (admin platform,
analytics, press, editable homepage, error logging, accounts/privacy, SEO, and
security hardening) on top of the 2026-06-10 catalogue baseline.

Verified before release: `next build` is green (type-check + ESLint + 85 static
pages, 0 errors). See `CHANGELOG.md` for the full feature list and
`SECURITY_AUDIT.md` for the security work.

> **Read this first.** In this repo `.env` points at the **live production**
> Mongo + S3, and the local `DATABASE_URL` carries `tlsAllowInvalidCertificates=true`.
> Run the database step (below) **from the deploy environment with the real
> production connection string**, not from a local checkout. The
> `npm run db:deploy` guard prints the target and refuses to do anything
> without `--confirm`.

---

## 1. Environment variables

**Already required (confirm they exist in prod):**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Production MongoDB. **Must NOT contain `tlsAllowInvalidCertificates=true`.** |
| `NEXTAUTH_SECRET` | NextAuth JWT signing secret. |
| `NEXTAUTH_URL` | Canonical site origin, `https://…` (also drives secure cookies). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 uploads + presigned URLs. |
| `AWS_REGION` / `AWS_BUCKET_NAME` | S3 bucket; also scopes the Next image-optimizer host allowlist. |

**New this release (set these or the related feature degrades):**

| Variable | If unset |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | SEO/sitemap/OpenGraph URLs fall back to `https://oscillationrecords.com`. Set to the canonical prod origin. |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Admin Spotify artist import is disabled. |
| `MUSICBRAINZ_USER_AGENT` | MusicBrainz/ISNI lookups send a generic UA (their API expects e.g. `OscillationRecords/1.0 ( you@example.com )`). |
| `ERROR_LOG_INGEST_URL` _(optional)_ | Server error ingest base URL; falls back to `VERCEL_URL`, then `NEXTAUTH_URL`. |
| `ERROR_LOG_INGEST_SECRET` _(optional)_ | Auth for the ingest endpoint; falls back to `NEXTAUTH_SECRET`. |

## 2. Secrets to rotate

The audit flagged that local development used live production credentials.
Before/at deploy, rotate: `NEXTAUTH_SECRET`, the MongoDB user password, AWS
access keys, and the Google + Spotify client secrets. Update them in the prod
environment, not in committed files (`.env` is gitignored — keep it that way).

## 3. Ship the code

1. Open the PR into `main` (description prepared separately) and merge.
2. Build on the host with `npm run build` (`prisma generate && next build`).
   The build runs the type-check and ESLint; treat a non-zero exit as a hard stop.

## 4. Database

One guarded command does both schema sync and the required data migration:

```bash
# Preview (changes nothing — prints the target + steps):
npm run db:deploy

# Execute (run in the deploy env, against the real prod connection string):
npm run db:deploy -- --confirm
```

What it does:

1. **`prisma db push`** — adds the new collections/fields: `PageView`,
   `LinkClick`, `ErrorLog`, `PressItem`, `User.role`,
   `Release.status` / `Release.comingSoonOrder`. Additive only (no
   `--accept-data-loss`, so a destructive diff aborts instead of dropping data).
2. **`scripts/migrate-upcoming-to-release.mjs`** — **required.** Backfills
   `status=RELEASED` on pre-existing releases (Mongo stores no value for the new
   enum; without this they disappear from the public site) and copies any
   legacy `UpcomingRelease` docs into `Release` with `status=SCHEDULED`.

`comingSoonOrder` (`Int?`) and `User.role` (`String? @default("user")`) are
optional and need no backfill. Admin access does **not** depend on the role
field — the bootstrap allowlist in `lib/auth-session.ts`
(`oscillationrecordz@gmail.com`, `tinyminer2015@gmail.com`) is always admin, so
there is no lock-out risk after the push.

## 5. Post-deploy verification

- [ ] Sign in with a bootstrap-allowlisted Google account; `/admin` loads.
- [ ] Confirm the Google OAuth **Authorized redirect URI** includes the prod
      domain (`https://<domain>/api/auth/callback/google`).
- [ ] `GET /admin` response carries the security headers and a per-request
      `Content-Security-Policy` with a `nonce-…`.
- [ ] `https://<domain>/robots.txt` and `https://<domain>/sitemap.xml` resolve
      and list public artists/releases.
- [ ] Run a release URL through Google's Rich Results Test — `MusicAlbum`
      JSON-LD is detected.
- [ ] Submit `sitemap.xml` in Google Search Console.
- [ ] Accept the cookie banner on the public site, browse a couple of pages,
      and confirm rows appear under **Admin → Live & raw data**.
- [ ] Images load through the optimizer (S3 + `scdn.co` Spotify artwork).

## 6. Rollback

- **Code:** redeploy the previous build / revert the merge commit.
- **Data:** the migration is additive and idempotent-ish — re-running is safe.
  It does not delete `UpcomingRelease` docs, so the prior data remains until you
  remove it deliberately.
