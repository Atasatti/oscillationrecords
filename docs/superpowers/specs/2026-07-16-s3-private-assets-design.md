# S3 private-asset hardening (#1) — Design

**Date:** 2026-07-16 (revised 2026-07-22)
**Status:** Code landed. The bucket policy change is the remaining step — it
touches LIVE production storage and must be applied AFTER the code deploys.
**Audit finding:** #1 (HIGH) — the S3 bucket is public-read, so sensitive uploads
(signed agreements, contact-form attachments, task attachments, competition
entries, DAM masters/stems/EPKs) have no server-side authorization — only the
object key protects them. Any leaked URL (a DB dump, a log line, a copied "Open"
link, browser history, a forwarded message) is permanently world-readable, with
no revocation short of deleting or re-keying the object.

## Measured current state (2026-07-22)

Read straight off the live bucket (`scripts/s3-verify-private-prefixes.mjs`,
read-only):

- **Bucket:** `osrecord`, `us-east-1`, 591 objects, ~11 GB.
- **Block Public Access:** all four settings OFF.
- **Bucket policy:** one statement — `Allow` `s3:GetObject` to `Principal: "*"`
  on `arn:aws:s3:::osrecord/*`. Everything is anonymously readable.
- **Confirmed exposed** (anonymous `GET` → 206): `contact/` (33 submitter
  uploads), `releases/agreements/` (signed contracts), `task-attachments/`,
  `benert-remix/` (22 competition entries, 222 MB).
- `assets/`, `tracks/stems/` and `documents/` are currently empty — the DAM
  prefixes are classified private up-front so the first upload is already safe.

## Key classification

| Prefix | Class | Why |
|---|---|---|
| `albums/`, `artists/`, `eps/`, `press/images/`, `releases/images/`, `singles/`, `site/`, `song-images/`, `tracks/audio/`, `tracks/images/`, `upcoming-releases/images/` | **public** | Cover art, artist/press photos, site imagery and released audio — rendered on public pages, optimized by `next/image`, listed in the image sitemap. |
| `assets/` | **private** | DAM uploads: masters, stems, EPKs, internal documents. |
| `benert-remix/` | **private** | Entrants' unreleased audio. Readable by the entrant who uploaded it, or an admin reviewing entries. |
| `contact/` | **private** | Files the public attaches to a contact ticket — demos and personal material. |
| `documents/` | **private** | Internal documents. |
| `releases/agreements/` | **private** | Signed contracts / licence scans. |
| `task-attachments/` | **private** | Internal task files. |
| `tracks/stems/` | **private** | Stems are DAM, never public. |

The single source of truth is `PRIVATE_KEY_PREFIXES` in `lib/s3-url.ts`; both
scripts carry a copy that must be kept in sync with it.

Note `releases/` splits: `releases/images/` is public, `releases/agreements/` is
private. Classification is by longest matching prefix, so the split is exact.

## Approach

1. **Bucket policy** adds an explicit `Deny` on the private prefixes for
   *anonymous* callers only, leaving the existing public `Allow` untouched.
2. **The app serves private objects via presigned GETs** through the existing
   download shim, `GET /api/assets/download` — generalized from "force a download
   disposition" to "the access-control point".
3. **No raw private URL is ever emitted** — every render site routes through
   `assetViewHref()` / `assetDownloadHref()`.

### Why Deny-anonymous rather than an enumerated public Allow

The bucket has 20+ live public prefixes accumulated over time (`albums/`,
`eps/`, `singles/`, `song-images/`, `upcoming-releases/`, per-artist-id folders…).
An allow-list that misses one silently 404s part of the live site. A deny-list
that misses a private prefix leaves it exactly as exposed as it is today — a
strictly smaller failure. The Deny carries
`Condition: { "Null": { "aws:PrincipalArn": "true" } }`, which is true only when
the request has no principal — i.e. anonymous. Signed requests, including every
presigned URL the app mints, are unaffected.

## Code (landed)

`lib/s3-url.ts` (pure, client-safe):

- `PRIVATE_KEY_PREFIXES`, `isPrivateAssetKey(key)`, `isPrivateAssetUrl(url)`
- `assetViewHref(url, name?)` — direct bucket URL for public media, the
  authorization-gated shim (inline disposition) for a private object
- `assetDownloadHref(url, name?, disposition?)` — the shim, attachment by default
- `benertUserKeyPrefix(sub)` — the `benert-remix/<sub>/` prefix one entrant owns;
  now the single definition used by presign, upload-complete and the shim

`lib/s3-access.ts` (server): `authorizeAssetKey(request, key)` maps a key to the
permission that owns it —

| Prefix | Requires |
|---|---|
| `releases/agreements/`, `tracks/stems/`, `assets/`, `documents/` | `catalog:read` |
| `contact/`, `task-attachments/` | `outreach:read` |
| `benert-remix/` | the entry's owner, or an admin |
| anything else (public media) | `catalog:read`, as before |

`GET /api/assets/download` now resolves the key first and authorizes *that
object* instead of gating the whole route on `catalog:read`.

Render sites routed through the helpers: the admin DAM (`app/admin/assets`, via a
new `viewHref` on the row — `fileUrl` is identity only now), contact-ticket
attachments, task attachments, agreement documents, and the Benert admin list
(the API returns a shim href, never the bucket URL). `GET /api/benert-remix/status`
no longer returns the entrant's file URL at all — just `hasUploaded`.

**Object lifecycle:** deleting a contact ticket, removing a task attachment, or
dropping an agreement document from a release's terms now also deletes the S3
object (best-effort, confined to that feature's own prefix). An orphaned private
object is unreachable through the app but still billable and still readable by
anyone holding a leaked key.

**On storing keys vs URLs:** records keep storing the full bucket URL. Once the
policy lands, that URL is not fetchable without a signature, so it is an
identifier rather than an access token — re-keying every stored value across
`Asset`, `Release.terms`, `ContactMessage.attachments`, `OutreachTask.attachments`
and `BenertRemixEntry` would be a large migration for no additional access
control.

## Applying the policy

```bash
# dry run — prints current + proposed policy, writes nothing
node --env-file=.env --use-system-ca scripts/s3-lock-private-prefixes.mjs
# apply
node --env-file=.env --use-system-ca scripts/s3-lock-private-prefixes.mjs --apply
# roll back (drops the Deny statement, restoring today's behaviour)
node --env-file=.env --use-system-ca scripts/s3-lock-private-prefixes.mjs --revert
```

The script refuses to write a policy with no `Allow` statement, so it cannot take
the public site's media offline.

## Rollout order

1. **Deploy the code first.** Until production renders private files through the
   shim, denying anonymous reads would break the admin's contract and attachment
   links. The code is a no-op while the bucket is still public.
2. **Apply the policy** (`--apply` above).
3. **Verify:** `node --env-file=.env --use-system-ca scripts/s3-verify-private-prefixes.mjs`
   — samples a real object under every prefix in the bucket and asserts public
   prefixes still return 200/206 while every private one returns 403. Exit code 1
   on any mismatch.
4. **Smoke-test the app:** admin DAM preview/download, open a contract, open a
   contact attachment, download a competition entry, public player + public
   images.

## Residual risk / follow-ups

- **Already-leaked URLs.** Anything that circulated before the cutover stops
  working the moment the Deny lands — that is the point — but if a specific
  object is known to have leaked, re-key it as well.
- **`(root)`** holds one 906 MB object and `test-folder/` holds three; both are
  currently public and unclassified. Worth identifying and either deleting or
  classifying.
- **Historical orphans — RESOLVED 2026-07-23 (audit #6).** 132 orphaned audio
  files (4.66 GB — 99 under `tracks/audio/`, 33 under legacy prefixes) were
  moved to `quarantine/` (now in the deny-list, so anonymous reads 403) by
  `scripts/cleanup-orphaned-audio.mjs`; an S3 lifecycle rule
  (`expire-quarantine`) deletes quarantined objects after 30 days. The local
  `orphaned-audio-manifest-*.json` records every moved key for restores.
  Going forward, `lib/s3-sweep.ts` deletes catalog objects at the source when a
  release/track is deleted or a file replaced (with a remaining-reference
  re-check, so shared files survive); the cleanup script remains the
  re-runnable backstop.
- **Streaming.** Public released audio deliberately stays on the public prefix so
  the player and CDN are unaffected. Pre-release audio uploaded under
  `tracks/audio/` is NOT covered by this split; if unreleased masters need to be
  private before release, upload them under `assets/` (private) and move them on
  publish.
