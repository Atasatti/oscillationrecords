# Lyrics Hub + Musixmatch Ingestion — Design

**Date:** 2026-07-08
**Status:** Approved (brainstorming) → pending implementation plan
**Workstream:** Genius / lyrics distribution (see `memory/lyrics-genius-workstream.md`)

## Problem

The label wants its catalogue's lyrics onto Genius and every lyrics surface (Apple/Spotify/Google, AI answer engines). The prior automation — a read-only Genius Search API checker (`genius-check.mjs`) — proved **0 of ~110 vocal tracks are on Genius**. Genius has **no song-creation API**, so there is no direct "upload the catalogue" automation. Every real path forward (manual flagship adds, LyricFind-via-Ditto bulk, any prep tooling, and owned-domain SEO/AEO) needs one prerequisite: **lyrics existing as digital text**.

Today `Track.lyrics` (Prisma `String?`) exists but is **empty for all 131 tracks**, and is **stripped from the public payload**. The lyrics only exist as text inside Musixmatch Pro (uploaded by the label via its distributor, Ditto).

## Goal

Make the website the single source of truth for lyrics, and make those lyrics work hard:

1. **Populate** the empty `Track.lyrics` field at scale by pulling the label's *own* lyrics back out of Musixmatch.
2. **Surface** lyrics publicly — on release pages (human) and in `schema.org` structured data (machine / AEO), on the owned domain the label controls.
3. **See coverage** in the admin so gaps are obvious and closeable.

Export tooling (Genius "Add a song" prep packets, LyricFind bulk file) is **explicitly deferred to phase 2** — it only has value once the field is populated, which this work makes real.

## What already exists (no build needed)

- `Track.lyrics String?` — Prisma schema (`prisma/schema.prisma:335`).
- Admin entry — the release-editor `TrackRow` already renders a Lyrics `<Textarea>` (`components/admin/release-editor/TrackRow.tsx:292-303`).
- Round-trip — `EditorTrack.lyrics` (`lib/release-editor.ts:285`), `buildTrackPayload` persists `lyrics: row.lyrics.trim() || null` (`lib/release-editor.ts:418`), and the admin serializer `serializeTrack` includes `lyrics` (`lib/release-format.ts:132`).
- `getReleaseDetail` selects the full track (`lib/catalog-data.ts:656`, `include: { tracks: {...} }`), so lyrics is already fetched for the release page — only the *serializer* strips it.

So the hub was never blocked on building the entry UI; it was blocked on lyrics existing. This design fills that gap and opens the read side.

---

## Architecture

Two independent sides, joined by the `Track.lyrics` column:

- **Pull side (E)** — offline batch scripts that populate the field from Musixmatch, with a human review gate.
- **Surface side (A–D)** — runtime code that exposes the populated field publicly and reports coverage in admin.

They can ship in either order; the surface side is smaller and safer (no external calls), so it goes first, then the pull side fills it.

### A · Reclassify lyrics as public *(the crux)*

`serializeTrackForPublic` (`lib/release-format.ts:160-177`) currently omits five fields: `isrcCode`, `iswc`, `lyrics`, `stemsFile`, `splits`. The other four are sensitive label IP (recording/composition codes, master stems, royalty splits with real names/emails). **Lyrics are the opposite — they are the content we want indexed.**

Change: remove **only** `lyrics` from the `Omit<>` type and the destructure strip. Keep ISRC/ISWC/stems/splits stripped exactly as now.

Consequences:
- `ReleaseDetailTrackDTO` (`lib/catalog-data.ts:611`) gains `lyrics: string | null`, flowing to `ReleaseDetailView` automatically.
- Update the doc comments that say "no ISRC/ISWC/lyrics/stems" (release-format.ts:154-159, 610; catalog-data.ts:29, 77) to reflect lyrics now shipping.
- No query change needed here — `getReleaseDetail` already selects it.

### B · Public display — ⋯ track details dialog

Add a "Lyrics" section to the existing per-track details modal in `ReleaseDetailView.tsx` (the dialog at lines 593-655, which already shows duration/composer/lyricist/credits). Render **only when `selectedTrack.lyrics` is non-empty**, below the credits block, using `whitespace-pre-wrap` inside a scrollable container. Matches the current dialog pattern; keeps the tracklist row compact (the approved display choice).

Note on crawlability: the dialog is client-rendered and mounts on click, so the *visible* lyrics are not in the initial server HTML. That is acceptable because the machine-readable AEO payload is delivered by (C), which **is** always in the initial HTML. Human-visible lyrics as body text is a possible phase-2 enhancement, not required here.

### C · Structured data — the real AEO win

In `buildReleaseJsonLd` (`lib/seo.ts:282-366`), the `MusicAlbum.track[]` array maps each track to a `MusicRecording` (lines 348-362). Add, per track, when lyrics present:

```jsonc
"lyrics": { "@type": "CreativeWork", "text": "<full lyrics>" }
```

(`MusicRecording.lyrics` expects a `CreativeWork` per schema.org.) This is server-rendered into `<head>` by `layout.tsx` and is always in the initial HTML — the payload AI answer engines and crawlers consume.

Required supporting change: the JSON-LD is built from `getReleaseMeta`, whose track select is `{ name, duration, isrcCode, iswc }` (`lib/catalog-data.ts:553`) — **add `lyrics: true`**. Extend the `ReleaseDetailLike.tracks[]` type in `lib/seo.ts:273-278` with `lyrics?: string | null`, and map it through in `getReleaseMeta`'s track projection (`lib/catalog-data.ts:597`).

Guard: emit `lyrics` only when non-empty and trimmed; keep the object out entirely otherwise (mirrors how ISRC/ISWC are conditionally added).

### D · Admin coverage — advisory, not scored

Two lightweight signals in the release editor, mirroring the existing **ISRC-missing hint** and **name-ambiguity advisory** precedents:

- **Per-track:** in `TrackRow.tsx`, a subtle "no lyrics yet" hint on rows whose `lyrics` is empty (styled like the existing muted meta hints, not the red ISRC error — lyrics are not a publish blocker).
- **Per-release:** a "Lyrics — N/M tracks" advisory line rendered in the existing **Discoverability** panel (`ReleaseScorePanel.tsx`), below the scored SEO signals and visually separated from them (it is advisory, not part of the /100). Computed in `ReleaseEditor` from the current track rows and passed to the panel as a prop.

**Deliberately NOT folded into the numeric SEO score** (`computeReleaseSeo`, `lib/seo-score.ts:179`). Instrumentals, dubs, and edits legitimately have no lyrics (the original `genius-check.mjs` explicitly skipped them); scoring them down would be wrong, and it would force a rebalance of every existing release's score. This follows the established pattern where content signals that don't apply universally (e.g. `assessNameAmbiguity`) are surfaced as **advisory** and kept out of the score. No weight changes, no score disruption.

### E · Musixmatch ingestion — two scripts, review gate between

Populates `Track.lyrics` from the label's own Musixmatch content. Split into **pull** (network, no DB writes) and **write** (DB, no network), with a human-reviewable JSON artifact in between.

**Library:** `Strvm/musicxmatch-api` (`pip install musicxmatch_api`), verified from source (`src/musicxmatch_api/main.py`):
- `get_track_lyrics(track_id=None, track_isrc=None)` — **accepts ISRC directly.**
- `get_track(track_id=None, track_isrc=None)` — track metadata by ISRC or id.
- `search_tracks(track_query, page=1)`, `search_artist(query, page=1)`.
- Signature: HMAC-SHA256 over the request URL with a secret **scraped from Musixmatch's web JS bundle** (fetch `_app` chunk → regex-extract encoded string → reverse → base64-decode). Lyrics text lives at `message.body.lyrics.lyrics_body` in the response.

**Script 0 — `scripts/export-lyric-candidates.mjs`** (DB read, Node/Prisma): queries Prisma for tracks whose `lyrics` is empty and emits `lyric-candidates.json`: `[{ trackId, name, primaryArtist, isrc }]`. The `trackId` + `isrc` must come from the DB (the hardcoded list in `genius-check.mjs` has neither), so this small read step is the source of truth, not that list.

**Script 1 — `scripts/musixmatch-pull-lyrics.py`** (network only):
1. Read `lyric-candidates.json` (from Script 0). Every entry is already an empty-lyrics candidate.
2. For each candidate: if it has an ISRC, call `get_track_lyrics(track_isrc=isrc)` (high confidence). Else `search_tracks("<title> <artist>")`, pick the best match by normalized title+artist (reuse the `norm()` normalization from `genius-check.mjs`), then `get_track_lyrics(track_id=...)`.
3. Write `lyrics-review.json`: per track `{ trackId, name, artist, isrc, matchMethod: "isrc"|"search"|"none", confidence, mxmTrackId, lyricsBody, notes }`. **No DB writes.**
4. Politeness: sequential with a delay between calls (mirror `genius-check.mjs`'s 300ms sleep + backoff); handle the "restricted / instrumental / not found" responses gracefully (record `matchMethod: "none"`).

**Script 2 — `scripts/ingest-lyrics.mjs`** (DB only, Node/Prisma):
1. Read the **reviewed** `lyrics-review.json` (human has pruned/edited it).
2. For each entry with lyrics: write to `Track.lyrics` **only if the current value is empty** — never overwrite existing lyrics.
3. `--dry-run` is the **default**; a real write requires an explicit `--write` flag and prints a summary (N to fill, M skipped-already-present, K skipped-no-match).
4. Runs under `NODE_OPTIONS=--use-system-ca` (per repo convention for Node HTTPS/Prisma against the live DB).

**Why the split:** it isolates the ToS-gray, breakable network call (Python) from the production DB write (Node/Prisma), and puts a mandatory human checkpoint on content quality before anything is persisted.

---

## Data flow

```
Prisma (empty-lyrics tracks) --(export)--> lyric-candidates.json
        |
Musixmatch  --(pull, ISRC/search)-->  lyrics-review.json  --(human review)-->  ingest --write-->  Track.lyrics
                                                                                                        |
                                                          +---------------------------------------------+
                                                          |                                             |
                                             serializeTrackForPublic (A)                    getReleaseMeta +lyrics (C)
                                                          |                                             |
                                              ReleaseDetailView ⋯ dialog (B)          buildReleaseJsonLd MusicRecording.lyrics (C)
                                                                                                        |
                                                                                            server HTML <head> JSON-LD (AEO)

Admin editor tracks --> ReleaseEditor computes coverage --> per-track hint + "N/M" advisory line (D)
```

## Error handling & edge cases

- **Instrumental / no lyrics on Musixmatch:** recorded as `matchMethod: "none"`; never written. Coverage indicator (D) correctly shows these as "no lyrics" without penalty.
- **Wrong / community-edited match:** caught at the review gate; the reviewer deletes or edits the entry before ingest.
- **Signature scrape breaks:** pull script fails loudly with a clear message; it is a one-off/occasional tool, never a runtime dependency of the site.
- **Existing lyrics:** ingest never overwrites a non-empty `Track.lyrics` (idempotent, safe to re-run).
- **JSON-LD size:** full lyrics in structured data is fine (they own the rights); guard against emitting empty objects.
- **Public payload:** ISRC/ISWC/stems/splits remain stripped — verify with a test that `serializeTrackForPublic` still omits exactly those four and now includes `lyrics`.

## Testing

- **Unit — `serializeTrackForPublic`:** asserts `lyrics` present, and `isrcCode`/`iswc`/`stemsFile`/`splits` absent.
- **Unit — `buildReleaseJsonLd`:** a track with lyrics emits `MusicRecording.lyrics = { @type: CreativeWork, text }`; a track without lyrics emits no `lyrics` key; verifies AEO shape.
- **Unit — coverage count (D):** N/M computed correctly, including all-instrumental (0/M) and fully-covered (M/M).
- **Unit — ingest safety:** given a review file, `--dry-run` writes nothing; `--write` fills only empty fields and never overwrites; no-match entries skipped.
- **Manual dogfood:** pull one flagship track by ISRC → review → ingest → confirm it renders in the ⋯ dialog and appears in the page's JSON-LD (`view-source`).

## Security / ToS / rights

- **Copyright:** the lyrics were authored and uploaded by the label; pulling their own content back is legitimate on copyright grounds.
- **API terms:** the wrapper reverse-engineers Musixmatch's internal signing — this violates Musixmatch's **API terms** regardless of content ownership. This is the label's decision for its own catalogue; documented here, not hidden.
- **Production data:** local `.env` points at the **live** MongoDB (see `memory/local-env-points-at-prod-data.md`) — hence dry-run default, fill-empty-only, and the review gate on the write script.
- **No secrets committed:** the pull script needs no API key (it scrapes the public JS bundle); the review JSON and any exports are git-ignored.

## Deferred (phase 2)

- **Genius "Add a song" prep packets** — per-track paste-ready metadata + lyrics for the manual Genius form.
- **LyricFind / Musixmatch bulk export** — a bulk file to feed the scalable distribution routes.

Both are only useful once `Track.lyrics` is populated, which (E) delivers.

## File-change summary

| Component | Files |
|---|---|
| A · public payload | `lib/release-format.ts` (serializer + comments), `lib/catalog-data.ts` (DTO comments) |
| B · display | `app/(main)/releases/[releaseId]/ReleaseDetailView.tsx` |
| C · structured data | `lib/seo.ts` (`buildReleaseJsonLd` + `ReleaseDetailLike`), `lib/catalog-data.ts` (`getReleaseMeta` select + projection) |
| D · admin coverage | `components/admin/release-editor/TrackRow.tsx`, `ReleaseScorePanel.tsx`, `ReleaseEditor.tsx` |
| E · ingestion | `scripts/export-lyric-candidates.mjs` (new), `scripts/musixmatch-pull-lyrics.py` (new), `scripts/ingest-lyrics.mjs` (new), `requirements.txt` or script-local note, `.gitignore` (candidate + review JSON) |
| tests | co-located unit tests for A, C, D, and ingest safety |
```
