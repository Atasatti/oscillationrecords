# Consolidated per-release downloads — Asset library

**Status:** approved design, pending implementation plan
**Date:** 2026-07-09
**Surface:** `/admin/catalog/assets` (Asset library / DAM)

## Problem

In the Asset library, every file is its own card in one flat grid. For a
release like "Benert Remixes" the cover artwork, each track master, and any
stems appear as separate cards, each with its own Download button — the
downloadable files for a release are scattered and there is no single, clear
download action. There is also no way to get a release's lyrics as a file.

## Goal

For each release (and, for completeness, each artist / unlinked bucket),
present **one consolidated download control**:

- **0 downloadable items** → a ⋯ button whose menu shows a single disabled
  "No downloads available".
- **1 item** → a direct Download button (no menu).
- **2+ items** → a ⋯ "Download" menu listing each item.

Individual per-file management (edit / delete / single download) must remain
available — this is also a file manager, not only a download surface.

## Current state (context)

- `AssetsClient.tsx` renders `assets: Asset[]` as a flat responsive grid,
  narrowed by a category `Segmented` filter (All / Master / Artwork / Stems /
  Press photo / EPK / Document / Other) and a search box. Each card has a
  Download link (`<a href={fileUrl} download>`), plus Edit/Delete for
  `source: "upload"` assets or a "Manage on its record" link for read-only
  catalog media.
- `Asset` shape (already provided to the client): `category`, `title`,
  `fileName`, `fileUrl`, `mimeType`, `size`, `releaseId`, `artistId`,
  `source` (`upload` | `release` | `artist` | `press`), `readOnly`,
  `parentHref`, `parentLabel`.
- Lyrics are **track text**, not DAM files: `Track.lyrics` (plain) and
  `Track.syncedLyrics` (LRC). The admin release payload exposes both
  (`serializeTrack`); the public one strips `syncedLyrics`.
- There is no lyrics-download endpoint today.

## Design

### 1. View toggle

Add a `Files | By release` view toggle to the assets page, distinct from the
existing category filter. **Files** keeps today's grid exactly as-is. **By
release** is the new grouped view. The category filter + search still apply
inside both views.

### 2. Grouping ("By release" view)

Group the (filtered) assets by linked entity:

- `releaseId` present → group `release:<id>`
- else `artistId` present → group `artist:<id>`
- else → single `unlinked` bucket

Order: releases (by name), then artists (by name), then Unlinked last. Each
group renders a card with:

- entity name, linking to its record (`parentHref` when available);
- a short "what's inside" summary (e.g. *Artwork · Master ×3 · Stems*);
- one consolidated **Download** control (`AssetActions`, below);
- an expandable list of the individual files, each keeping its existing
  per-file actions (single download; edit/delete for uploads; "Manage on its
  record" for read-only).

When a specific category filter is active, groups show only matching files
and empty groups are hidden. Synthesized lyrics items appear only when the
category filter is "All" (lyrics are not a file category).

### 3. `AssetActions` component (reusable)

`components/admin/AssetActions.tsx` — pure presentational. Props: `items:
DownloadItem[]` and optional labels.

```
type DownloadItem = {
  label: string;      // e.g. "Download artwork", "Download lyrics (.txt)"
  href: string;       // fileUrl or the lyrics endpoint
  downloadName?: string; // for the <a download> attribute (file assets)
};
```

Behavior:

- `items.length === 0` → ⋯ button → menu with one disabled
  "No downloads available".
- `items.length === 1` → a direct Download button that performs
  `items[0]` (anchor with `download`), no menu.
- `items.length >= 2` → ⋯ "Download" menu, one entry per item.

Menu uses the existing Radix `DropdownMenu`. Because it opens from a ⋯
trigger, call `unlockBody()` is **not** needed (no dialog is involved), but
follow the established menu-item pattern.

Kept standalone so the release detail page and other surfaces can reuse it.

### 4. Download items

Built per group from its assets (+ lyrics for release groups):

- **File assets:** one item each. Label = `Download <CategoryLabel>`; when the
  group has more than one asset of that category, append ` — <title|fileName>`
  to disambiguate (e.g. *"Download master — 01 Benert.wav"*). `href = fileUrl`,
  `downloadName = fileName`.
- **Lyrics (release groups only):**
  - `Download lyrics (.txt)` when the release has any track with plain
    `lyrics` → `href = /api/releases/<id>/lyrics?format=txt`.
  - `Download lyrics (.lrc)` when the release has any track with
    `syncedLyrics` → `href = /api/releases/<id>/lyrics?format=lrc`.

### 5. Data & endpoint

**Server data (`app/admin/catalog/assets/page.tsx`):** alongside `initial`,
`releases`, `artists`, provide per-release lyrics availability so the grouped
view can show the lyrics items without fetching each release:

```
releaseLyrics: Record<string, { txt: boolean; lrc: boolean }>
```

computed from one `Track` query over the releases that have assets
(`txt = any track lyrics non-empty`, `lrc = any track syncedLyrics
non-empty`).

**New endpoint `GET /api/releases/[releaseId]/lyrics?format=txt|lrc`**
(`requirePermission(..., "catalog:read")`):

- Loads the release's tracks in order.
- `txt`: combined plain-text, per-track header, e.g.
  `01. <track name>\n\n<lyrics>\n\n`. `Content-Type: text/plain;
  charset=utf-8`, `Content-Disposition: attachment;
  filename="<release-slug>-lyrics.txt"`. Only tracks with non-empty lyrics.
- `lrc`: tracks with non-empty `syncedLyrics`. Exactly one → return that LRC
  directly (`filename="<track-slug>.lrc"`). More than one → a **store-only
  zip** of `NN <track name>.lrc` entries (`Content-Type: application/zip`,
  `filename="<release-slug>-lrc.zip"`).
- Nothing to return (no matching lyrics) → `404`.

**Zip:** avoid a new runtime dependency — a small store-only (no compression)
zip writer in `lib/zip.ts` is enough for a handful of small text files
(deflate is unnecessary). Pure function: `(files: {name, data}[]) => Buffer`.

### 6. Component boundaries

- `AssetActions.tsx` — presentational (items → direct / menu / none). No data
  access.
- `groupAssets(assets)` — pure helper producing ordered groups; unit-testable
  in isolation.
- `buildDownloadItems(group, releaseLyrics)` — pure; maps a group (+ lyrics
  flags) to `DownloadItem[]`.
- `GET /api/releases/[id]/lyrics` — isolated route.
- `lib/zip.ts` — pure store-only zip writer.

## Edge cases

- Read-only catalog media (cover art, artist photos) has a `fileUrl` and is
  downloadable; its per-file management stays a "Manage on its record" link.
- A release group containing only read-only catalog media still gets the
  consolidated download.
- Empty catalog / no assets → the "By release" view shows the same empty state
  as the flat view.
- Category filter active → lyrics items hidden; groups with no matching files
  hidden.

## Out of scope (v1)

- "Download all (zip)" of a release's *mixed* files.
- Lyrics downloads on artist / unlinked groups (lyrics are release/track
  scoped).
- Multi-release bulk download.

## Sequencing / coordination

Implementation edits `AssetsClient.tsx`, which another agent currently has
uncommitted changes in (the `noUncheckedIndexedAccess` strict-typing
migration). Land this work **after** those changes settle to avoid clobbering
them, and re-read the file's current state before editing.

## Files touched (anticipated)

- `app/admin/catalog/assets/AssetsClient.tsx` — view toggle, grouped view.
- `app/admin/catalog/assets/page.tsx` — `releaseLyrics` server data.
- `components/admin/AssetActions.tsx` — new reusable control.
- `lib/asset-grouping.ts` (or colocated) — `groupAssets`,
  `buildDownloadItems` pure helpers.
- `app/api/releases/[releaseId]/lyrics/route.ts` — new endpoint.
- `lib/zip.ts` — store-only zip writer.
