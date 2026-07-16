# S3 private-asset hardening (#1) — Design

**Date:** 2026-07-16
**Status:** Draft — needs an AWS bucket-policy change (owner) before the code cutover
**Audit finding:** #1 (HIGH) — the S3 bucket is public-read; sensitive DAM assets
(unreleased masters, stems, EPKs, legal contracts) have no server-side
authorization — only the object-key UUID protects them. Any leaked URL (a DB
dump, a log line, a copied "Open" link, browser history, a shared file) is
permanently world-readable with no revocation short of deleting/re-keying.

## Current state

- **Bucket:** `osrecord`, region `us-east-1`, **public-read** (objects served
  directly at `https://osrecord.s3.us-east-1.amazonaws.com/<key>`).
- **URL helper:** `publicFileUrl(key)` (`lib/s3.ts`) builds that direct URL; it's
  stored on records (`Asset.fileUrl`, `Release.coverImage`, `Track.audioFile`,
  `Track.stemsFile`, agreement docs, …) and rendered/linked directly.
- **A presigned-GET path already exists:** `GET /api/assets/download?url=…`
  (`catalog:read`-gated) presigns a short-lived GET for one of our own objects and
  302-redirects to it (`keyFromOwnBucketUrl` refuses any foreign host). The release
  **agreement** flow (`/api/releases/[releaseId]/agreement/presign`) is the same
  idea. So the infrastructure to serve a file behind per-request authorization is
  already here — today it's used only for the *download disposition*, not for
  *access control*.

The gap: **nothing stops a direct public GET** of a private object, because the
bucket allows public reads on every key.

## Key classification

Split keys into **public** (must stay world-readable — they're on the public site
and behind the CDN) and **private** (authorization required):

| Prefix | Class | Why |
|---|---|---|
| `releases/images/`, `artists/images/`, `press/images/`, `site/` | **public** | Cover art, artist photos, press images, site imagery — rendered on public pages / in `next/image` / the sitemap. |
| `tracks/audio/` **of a RELEASED track** | **public** | Streamed by the public player. |
| `tracks/audio/` **of a DRAFT/SCHEDULED track** | **private** | Unreleased audio / masters must not leak pre-release. |
| `tracks/stems/` | **private** | Stems are DAM, never public. |
| `benert-remix/` | **public** (competition entries) | Already server-owned per-user; entrants share links. Keep as-is. |
| `task-attachments/`, agreement/contract docs, EPKs, any `documents/` | **private** | Internal / legal. |

> The awkward case is `tracks/audio/`: public once RELEASED, private before. Two
> ways to handle it (pick one in review):
> 1. **Prefix by lifecycle** — upload pre-release audio under a private prefix
>    (e.g. `tracks/audio-private/`) and **copy/move** it to the public
>    `tracks/audio/` on publish. Clean rule (prefix = class), but adds a move step
>    to the publish path.
> 2. **Always-private audio + presigned playback** — serve ALL audio via
>    short-lived presigned GETs (even public tracks). Simplest rule, but every
>    play needs a presign and CDN caching of audio is lost. Not recommended for a
>    streaming site.
>
> **Recommendation:** option 1 (lifecycle prefix) for audio; everything else is a
> static public-vs-private prefix split.

## Approach

1. **Bucket policy** blocks public reads on the private prefixes; public prefixes
   stay world-readable (served by the CDN as today).
2. **App serves private objects via presigned GETs** — the existing download-shim
   pattern, generalized from "download disposition" to "access control".
3. **Uploads to a private prefix** return a *key* (or a `/api/assets/download`
   URL), not a raw public URL, so nothing stores a directly-fetchable link.
4. **No public URL is ever emitted for a private key** — a `assetHref()` helper
   routes public keys → `publicFileUrl`, private keys → the presigned-GET route.

## Code changes (draft — land WITH the AWS policy, not before)

Add to `lib/s3.ts`:

```ts
// Prefixes whose objects must NOT be publicly readable (served via presigned GET).
export const PRIVATE_KEY_PREFIXES = ["tracks/stems/", "tracks/audio-private/", "documents/"] as const;

export function isPrivateAssetKey(key: string): boolean {
  return PRIVATE_KEY_PREFIXES.some((p) => key.startsWith(p));
}

/** Access URL for a stored key: direct public URL for public keys, the
 *  authorization-gated presigned-GET shim for private ones. */
export function assetHref(key: string): string {
  if (isPrivateAssetKey(key)) {
    return `/api/assets/download?url=${encodeURIComponent(publicFileUrl(key))}&disposition=inline`;
  }
  return publicFileUrl(key);
}
```

Then, at each site that today emits a private object's URL, route it through
`assetHref()` (or the download shim) instead of `publicFileUrl`. Concretely:

- **Stems** (`Track.stemsFile`) — admin-only display/download → already goes
  through `downloadHrefFor` on the assets page; confirm every render uses the shim,
  none the raw URL.
- **Agreements/contracts** — already presigned; verify no raw URL is stored/leaked.
- **Pre-release audio** (option 1) — upload under `tracks/audio-private/`; on
  publish, `CopyObject` → `tracks/audio/` (public) and update `Track.audioFile`.
  The admin editor's pre-release preview plays via `assetHref()`.
- **Presign-GET route** — `/api/assets/download` already gates on `catalog:read`;
  for finer control, gate stems/documents on the appropriate permission.

Uploads: the presign-PUT routes (already prefix-confined per #26) keep writing
private objects under the private prefixes; they just shouldn't return a
public-render URL for those — return the key + let the client fetch via the shim.

## Exact AWS steps (owner applies)

1. **Confirm/keep Block Public Access OFF only for the public prefixes.** The
   cleanest split is *two paths in one bucket* with a policy that grants public
   read ONLY to the public prefixes and denies it elsewhere.

2. **Bucket policy** (S3 → `osrecord` → Permissions → Bucket policy). Grant public
   `s3:GetObject` on the public prefixes; nothing else is public:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "PublicReadPublicPrefixes",
         "Effect": "Allow",
         "Principal": "*",
         "Action": "s3:GetObject",
         "Resource": [
           "arn:aws:s3:::osrecord/releases/images/*",
           "arn:aws:s3:::osrecord/artists/images/*",
           "arn:aws:s3:::osrecord/press/images/*",
           "arn:aws:s3:::osrecord/site/*",
           "arn:aws:s3:::osrecord/tracks/audio/*",
           "arn:aws:s3:::osrecord/benert-remix/*"
         ]
       }
     ]
   }
   ```

   With no `Allow` for the private prefixes (`tracks/stems/*`,
   `tracks/audio-private/*`, `documents/*`, `task-attachments/*`), a public GET of
   those returns **403**. The app's IAM user (its access key) still reads them via
   the SDK for presigning — presigned GETs are signed with those credentials, so
   they keep working.

3. **If Block Public Access is currently ON** and objects are served some other
   way, adapt: the goal is only public prefixes are anonymously GET-able.

4. **Verify:**
   - Anonymous `curl https://osrecord.s3.us-east-1.amazonaws.com/tracks/stems/<known-key>` → **403**.
   - Anonymous `curl …/releases/images/<known-cover>` → **200**.
   - App: a presigned GET of a stems key (via `/api/assets/download`) → **200**.

## Migration / rollout order (avoid breaking live assets)

1. **Land the code first, inert** — `isPrivateAssetKey` / `assetHref` added and
   used at private-asset render sites, but with all current objects still under
   public prefixes it's a no-op (public URLs unchanged). Deploy + verify nothing
   regresses.
2. **Move existing private objects** into the private prefixes (`tracks/stems/`
   already private-classed; if masters/pre-release audio live under `tracks/audio/`
   today, decide per the audio note above). Update any stored `stemsFile` /
   document URLs to the new keys.
3. **Apply the bucket policy** (step above). Now public reads of the private
   prefixes 403; the app serves them via presigned GETs.
4. **Smoke-test** the admin DAM (download stems, open a contract), the public
   player (released audio still streams), and public images (still load).

## Non-goals / residual

- **No CDN/signed-cookie scheme** for private audio streaming (option 2) — out of
  scope; option 1 keeps public audio on the CDN.
- **Lifecycle reaper** for orphaned uploads (part of #6) is a separate S3
  lifecycle rule.
- Existing **leaked** public URLs (if any already circulated) are only revoked by
  re-keying those specific objects — note for the owner.

## Verification checklist (post-cutover)

- [ ] Anonymous GET of a `tracks/stems/*` key → 403; of a cover → 200.
- [ ] Admin can still download stems + open contracts (presigned).
- [ ] Public player streams RELEASED audio; pre-release audio is not anonymously fetchable.
- [ ] `next/image` covers + sitemap images still resolve.
- [ ] No raw private URL appears in any API response or page source.
