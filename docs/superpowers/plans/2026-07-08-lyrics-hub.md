# Lyrics Hub + Musixmatch Ingestion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty `Track.lyrics` field into a working lyrics hub — publicly displayed, machine-readable for AEO, coverage-visible in admin — and populate it by pulling the label's own lyrics back out of Musixmatch.

**Architecture:** Two independent sides joined by the `Track.lyrics` column. The **surface side** (Tasks 2–5) reclassifies lyrics as public, renders them in the release-page track dialog, emits `MusicRecording.lyrics` JSON-LD, and shows advisory coverage in the tracklist editor. The **pull side** (Tasks 6–8) is three offline scripts — export empty-lyrics candidates → pull from Musixmatch (Python) → review → ingest into Prisma (dry-run default, fill-empty-only). Task 1 stands up a minimal vitest harness for the correctness-critical pure functions.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Prisma 6 (MongoDB), vitest (new, dev-only), Python 3 + `musicxmatch_api` (one-off script only).

**Reference spec:** `docs/superpowers/specs/2026-07-08-lyrics-hub-design.md`

## Global Constraints

- **Public payload must never leak sensitive IP:** `serializeTrackForPublic` keeps stripping `isrcCode`, `iswc`, `stemsFile`, `splits`. This task only un-strips `lyrics`.
- **Ingest never overwrites:** write to `Track.lyrics` only when the current value is empty; never replace existing lyrics. `--dry-run` is the default; persisting requires an explicit `--write` flag.
- **Advisory coverage is NOT scored:** lyrics coverage is surfaced as an advisory count, never folded into `computeReleaseSeo` (instrumentals legitimately have no lyrics).
- **Node scripts that touch the DB or HTTPS run with `node --use-system-ca`** (repo convention; the corporate CA is required for Prisma/HTTPS).
- **Local `.env` points at the LIVE production database + S3.** The export script is read-only; the ingest script is dry-run by default. Treat every run as touching production.
- **Musixmatch wrapper is unofficial / ToS-gray and can break without notice.** It is a one-off operator script, never imported by the website runtime.
- **Commits:** stage explicit paths with `git --literal-pathspecs add <path>`; never `git add -A`. Verify `npx tsc --noEmit` and `npm run lint` before committing code. End commit messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. **Do not push** — the user pushes when they say it's 100%.
- **Do not run `next build` while the dev server is running.**

---

### Task 1: Vitest harness

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts + devDependencies)
- Create: `tests/harness.test.ts`

**Interfaces:**
- Produces: an `npm test` command (`vitest run`) that resolves `@/*` path aliases from `tsconfig.json`, so all later tasks' tests can `import { x } from "@/lib/..."`.

- [ ] **Step 1: Install vitest + the tsconfig-paths resolver (dev-only)**

Run:
```bash
npm install -D vitest vite-tsconfig-paths
```
Expected: both appear under `devDependencies` in `package.json`. (If npm errors on TLS, the repo's system CA applies — see the memory note on `--use-system-ca`; retry with `npm config set cafile <corp-ca.pem>` if needed.)

- [ ] **Step 2: Create the vitest config**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Minimal harness: node environment (all tested units are pure — no DOM), with
// `@/*` aliases read straight from tsconfig.json via the plugin.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

In the `"scripts"` block, add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Write the smoke test**

`tests/harness.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
  it("resolves @/ path aliases", () => {
    // Import resolving to a function proves the tsconfig-paths plugin works.
    expect(typeof slugify).toBe("function");
  });
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: PASS, 2 tests in `tests/harness.test.ts`. If the alias test fails to resolve, fix `vitest.config.ts` before proceeding.

- [ ] **Step 6: Commit**

```bash
git --literal-pathspecs add vitest.config.ts package.json package-lock.json tests/harness.test.ts
git commit -m "test: add minimal vitest harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Reclassify lyrics as public

Un-strip `lyrics` from the public track payload; keep ISRC/ISWC/stems/splits stripped.

**Files:**
- Modify: `lib/release-format.ts:154-177` (`serializeTrackForPublic` + its JSDoc)
- Modify: `lib/catalog-data.ts:29,77,610` (doc comments that say "no ... lyrics ...")
- Test: `lib/release-format.test.ts`

**Interfaces:**
- Produces: `serializeTrackForPublic(t: Track)` now returns an object that **includes** `lyrics: string | null` and still **omits** `isrcCode`, `iswc`, `stemsFile`, `splits`. `ReleaseDetailTrackDTO` (its return type) therefore gains `lyrics`.

- [ ] **Step 1: Write the failing test**

`lib/release-format.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { serializeTrackForPublic } from "@/lib/release-format";

// A representative full Track row (only the fields the serializer reads matter).
const track = {
  id: "t1", name: "Song", image: null, audioFile: "a.mp3", duration: 200,
  releaseDate: null, composer: null, lyricist: null, leadVocal: null,
  lyrics: "line one\nline two", stemsFile: "stems.zip", trackCredits: null,
  splits: [{ name: "X", percent: 100 }], isrcCode: "GB1234567890", iswc: "T1234",
  isrcExplicit: false, spotifyLink: null, appleMusicLink: null, tidalLink: null,
  amazonMusicLink: null, youtubeLink: null, soundcloudLink: null,
  primaryArtistIds: [], featureArtistIds: [], featureArtistNames: [],
  sortOrder: 0, createdAt: new Date(0), updatedAt: new Date(0),
} as unknown as Parameters<typeof serializeTrackForPublic>[0];

describe("serializeTrackForPublic", () => {
  it("ships lyrics as public content", () => {
    expect(serializeTrackForPublic(track).lyrics).toBe("line one\nline two");
  });

  it("never leaks sensitive IP", () => {
    const pub = serializeTrackForPublic(track) as Record<string, unknown>;
    expect(pub.isrcCode).toBeUndefined();
    expect(pub.iswc).toBeUndefined();
    expect(pub.stemsFile).toBeUndefined();
    expect(pub.splits).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/release-format.test.ts`
Expected: the "ships lyrics" test FAILS (`pub.lyrics` is `undefined` — lyrics currently stripped). The "never leaks" test passes.

- [ ] **Step 3: Un-strip lyrics in the serializer**

In `lib/release-format.ts`, replace the `serializeTrackForPublic` definition (lines 160-177) with:
```ts
export function serializeTrackForPublic(
  t: Track
): Omit<ReturnType<typeof serializeTrack>, "isrcCode" | "iswc" | "stemsFile" | "splits"> {
  const {
    isrcCode: _isrc,
    iswc: _iswc,
    stemsFile: _stems,
    splits: _splits,
    ...rest
  } = serializeTrack(t);
  void _isrc;
  void _iswc;
  void _stems;
  void _splits;
  return rest; // `rest` now includes `lyrics` — public, indexable content.
}
```

- [ ] **Step 4: Update the serializer's JSDoc (lines 154-159)**

Replace it with:
```ts
/**
 * Public payloads: omit ISRC, ISWC, the master `stemsFile` URL, and the royalty
 * `splits` — stems are sensitive label IP and splits hold internal real
 * names/emails; none must ship to anonymous clients. Lyrics ARE shipped: they are
 * owned, indexable content (the release page + JSON-LD surface them). The admin
 * session still uses the full {@link serializeTrack}.
 */
```

- [ ] **Step 5: Fix the stale "no lyrics" doc comments**

- `lib/catalog-data.ts:29` — change the comment `// use the public payload shape (no ISRC/ISWC/lyrics/stems).` to `// use the public payload shape (no ISRC/ISWC/stems; lyrics included).`
- `lib/catalog-data.ts:77` — the comment `// player) and a track count — not every track's audio/lyrics/credits. This` is about the *listing* projection (which deliberately stays lean) and is still correct; leave it.
- `lib/catalog-data.ts:610` — change `/** Public track shape served to the release page (no ISRC/ISWC/lyrics/stems). */` to `/** Public track shape served to the release page (no ISRC/ISWC/stems; lyrics included). */`

- [ ] **Step 6: Run the tests + typecheck**

Run: `npx vitest run lib/release-format.test.ts && npx tsc --noEmit`
Expected: both tests PASS; tsc reports no errors.

- [ ] **Step 7: Commit**

```bash
git --literal-pathspecs add lib/release-format.ts lib/release-format.test.ts lib/catalog-data.ts
git commit -m "Lyrics: ship lyrics in the public track payload (keep ISRC/ISWC/stems/splits private)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: MusicRecording.lyrics structured data

Emit `lyrics` as a `CreativeWork` on each `MusicRecording` in the release JSON-LD, and select the field for the metadata query.

**Files:**
- Modify: `lib/seo.ts:273-278` (`ReleaseDetailLike.tracks[]` type), `lib/seo.ts:348-362` (`MusicRecording` map)
- Modify: `lib/catalog-data.ts:517-522` (`ReleaseMetaDTO.tracks[]` type), `:553` (select), `:597-602` (projection)
- Test: `lib/seo.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildReleaseJsonLd` emits `track[i].lyrics = { "@type": "CreativeWork", text }` when a track has non-empty lyrics, and omits the key otherwise. `getReleaseMeta` now returns `tracks[i].lyrics: string | null`.

- [ ] **Step 1: Write the failing test**

`lib/seo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildReleaseJsonLd } from "@/lib/seo";

describe("buildReleaseJsonLd — lyrics", () => {
  it("emits MusicRecording.lyrics as a CreativeWork when present", () => {
    const ld = buildReleaseJsonLd({
      id: "r1", name: "Rel", type: "single",
      tracks: [{ name: "Song", duration: 200, lyrics: "la la la" }],
    }) as { track: Array<{ lyrics?: unknown }> };
    expect(ld.track[0].lyrics).toEqual({ "@type": "CreativeWork", text: "la la la" });
  });

  it("omits lyrics when empty or whitespace", () => {
    const ld = buildReleaseJsonLd({
      id: "r1", name: "Rel", type: "single",
      tracks: [{ name: "Song", duration: 200, lyrics: "   " }],
    }) as { track: Array<{ lyrics?: unknown }> };
    expect(ld.track[0].lyrics).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/seo.test.ts`
Expected: the first test FAILS (`lyrics` undefined — not yet emitted). Note: if TS complains that `lyrics` isn't a valid property on the track literal, that's expected until Step 3.

- [ ] **Step 3: Add `lyrics` to the `ReleaseDetailLike` track type**

In `lib/seo.ts`, change the `tracks` array type (lines 273-278) to:
```ts
  tracks?: Array<{
    name: string;
    duration?: number | null;
    isrcCode?: string | null;
    iswc?: string | null;
    lyrics?: string | null;
  }>;
```

- [ ] **Step 4: Emit the lyrics CreativeWork in the MusicRecording map**

In `lib/seo.ts`, inside the `release.tracks.map(...)` callback, immediately after the ISWC block (after line 360, before `return rec;`), add:
```ts
      const lyrics = (t.lyrics ?? "").trim();
      if (lyrics) rec.lyrics = { "@type": "CreativeWork", text: lyrics };
```

- [ ] **Step 5: Run the JSON-LD test**

Run: `npx vitest run lib/seo.test.ts`
Expected: both tests PASS.

- [ ] **Step 6: Select + project lyrics in `getReleaseMeta`**

In `lib/catalog-data.ts`:
- `ReleaseMetaDTO.tracks[]` type (lines 517-522) — add `lyrics: string | null;`:
```ts
  tracks: {
    name: string;
    duration: number | null;
    isrcCode: string | null;
    iswc: string | null;
    lyrics: string | null;
  }[];
```
- The track `select` (line 553) — add `lyrics: true`:
```ts
          select: { name: true, duration: true, isrcCode: true, iswc: true, lyrics: true },
```
- The projection (lines 597-602) — add `lyrics`:
```ts
      tracks: r.tracks.map((t) => ({
        name: t.name,
        duration: t.duration || null,
        isrcCode: t.isrcCode ?? null,
        iswc: t.iswc ?? null,
        lyrics: t.lyrics ?? null,
      })),
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`getReleaseMeta`'s return is passed to `buildReleaseJsonLd` in `layout.tsx`; the added `lyrics` field keeps `ReleaseMetaDTO` assignable to `ReleaseDetailLike`.)

- [ ] **Step 8: Commit**

```bash
git --literal-pathspecs add lib/seo.ts lib/seo.test.ts lib/catalog-data.ts
git commit -m "AEO: emit MusicRecording.lyrics (CreativeWork) in release JSON-LD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Admin lyrics-coverage indicator (advisory)

A pure coverage helper + a per-release count in the tracklist header + a per-track hint. **Not** part of the SEO score.

**Files:**
- Create: `lib/lyrics-coverage.ts`
- Test: `lib/lyrics-coverage.test.ts`
- Modify: `components/admin/release-editor/TrackList.tsx:389-403` (header count)
- Modify: `components/admin/release-editor/TrackRow.tsx:122-135` (per-track hint)

**Interfaces:**
- Produces: `lyricsCoverage(tracks: Array<{ lyrics?: string | null }>): { withLyrics: number; total: number }`.

- [ ] **Step 1: Write the failing test**

`lib/lyrics-coverage.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { lyricsCoverage } from "@/lib/lyrics-coverage";

describe("lyricsCoverage", () => {
  it("counts only tracks with non-empty lyrics", () => {
    expect(lyricsCoverage([{ lyrics: "a" }, { lyrics: "" }, { lyrics: null }, {}]))
      .toEqual({ withLyrics: 1, total: 4 });
  });
  it("all instrumental → 0 of N", () => {
    expect(lyricsCoverage([{ lyrics: "  " }, {}])).toEqual({ withLyrics: 0, total: 2 });
  });
  it("fully covered → N of N", () => {
    expect(lyricsCoverage([{ lyrics: "x" }, { lyrics: "y" }])).toEqual({ withLyrics: 2, total: 2 });
  });
  it("empty release → 0 of 0", () => {
    expect(lyricsCoverage([])).toEqual({ withLyrics: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/lyrics-coverage.test.ts`
Expected: FAIL — `lyricsCoverage` not found / module missing.

- [ ] **Step 3: Implement the helper**

`lib/lyrics-coverage.ts`:
```ts
// Advisory lyrics coverage for a release's tracks. Deliberately NOT part of the
// SEO score — instrumentals/dubs legitimately have no lyrics (see the design
// spec); scoring them down would be wrong. Pure — safe on server or client.
export function lyricsCoverage(
  tracks: Array<{ lyrics?: string | null }>
): { withLyrics: number; total: number } {
  const withLyrics = tracks.filter((t) => Boolean((t.lyrics ?? "").trim())).length;
  return { withLyrics, total: tracks.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/lyrics-coverage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Show the count in the tracklist header**

In `components/admin/release-editor/TrackList.tsx`:
- Add the import near the other `@/lib` imports (after line 42):
```ts
import { lyricsCoverage } from "@/lib/lyrics-coverage";
```
- Just before `return (` (around line 389), compute:
```ts
  const lyrics = lyricsCoverage(tracks);
```
- In the header `<h3>` (lines 393-398), replace the block with:
```tsx
          <h3 className="text-lg font-medium text-gray-200">
            Tracks{" "}
            <span className="text-sm font-normal text-gray-500">
              ({tracks.length})
            </span>
            {lyrics.total > 0 ? (
              <span className="ml-2 text-xs font-normal text-gray-500">
                · {lyrics.withLyrics}/{lyrics.total} with lyrics
              </span>
            ) : null}
          </h3>
```

- [ ] **Step 6: Add the per-track hint**

In `components/admin/release-editor/TrackRow.tsx`, the collapsed summary already renders an artists line inside `!track.expanded` (lines 122-135). Append a lyrics hint to that subtext by replacing the inner `<span className="truncate">...</span>` (lines 128-132) with:
```tsx
              <span className="truncate">
                {primaryNames.length || featText
                  ? `${primaryNames.join(", ")}${featText ? ` · feat. ${featText}` : ""}`
                  : "No artists set"}
                {!track.lyrics.trim() ? (
                  <span className="text-gray-600"> · no lyrics yet</span>
                ) : null}
              </span>
```

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 8: Manual check**

Start (or reuse) the dev server, open a release's tracks editor (`/admin/catalog/releases/<id>/tracks`). Confirm: the header reads e.g. "Tracks (12) · 0/12 with lyrics", and collapsed rows without lyrics show "· no lyrics yet". (Do not run `next build`.)

- [ ] **Step 9: Commit**

```bash
git --literal-pathspecs add lib/lyrics-coverage.ts lib/lyrics-coverage.test.ts components/admin/release-editor/TrackList.tsx components/admin/release-editor/TrackRow.tsx
git commit -m "Admin: advisory lyrics-coverage in the tracklist editor

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Public lyrics display in the ⋯ track dialog

**Files:**
- Modify: `app/(main)/releases/[releaseId]/ReleaseDetailView.tsx:631-651` (inside the track-details `Dialog`)

**Interfaces:**
- Consumes: `selectedTrack.lyrics: string | null` (now present on `ReleaseDetailTrackDTO` from Task 2).

- [ ] **Step 1: Add the Lyrics section**

In `ReleaseDetailView.tsx`, inside the dialog body, immediately after the `parsedTrackCredits.length > 0 ? (...) : null}` block (i.e. after line 651, before the closing `</div>` on line 652), insert:
```tsx
              {selectedTrack.lyrics ? (
                <div>
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Lyrics</h3>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-3 text-sm leading-relaxed text-gray-200">
                    {selectedTrack.lyrics}
                  </div>
                </div>
              ) : null}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (If tsc reports `lyrics` missing on the track type, Task 2 wasn't applied — fix that first.)

- [ ] **Step 3: Manual check**

On a release page, open a track's ⋯ details dialog. With lyrics empty (current state) the section is absent. To verify rendering before ingest exists, temporarily set one track's `lyrics` in the admin editor, save, reload the release page, open the dialog → the Lyrics block shows with preserved line breaks. Also `view-source` the page and confirm the JSON-LD `<script type="application/ld+json">` contains `"lyrics":{"@type":"CreativeWork","text":"..."}` for that track (validates Task 3 end-to-end).

- [ ] **Step 4: Commit**

```bash
git --literal-pathspecs add "app/(main)/releases/[releaseId]/ReleaseDetailView.tsx"
git commit -m "Releases: show track lyrics in the details dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Ingest helpers + candidate export

The pure fill-decision logic (tested) and the read-only candidate exporter.

**Files:**
- Create: `scripts/lib/lyrics-ingest.mjs`
- Test: `scripts/lib/lyrics-ingest.test.mjs`
- Create: `scripts/export-lyric-candidates.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `shouldFillLyrics(current, incoming): boolean` and `normalizeLyrics(value): string | null` (consumed by Task 8). `export-lyric-candidates.mjs` writes `lyric-candidates.json`: `Array<{ trackId, name, primaryArtist, isrc }>` (consumed by Task 7).

- [ ] **Step 1: Write the failing test**

`scripts/lib/lyrics-ingest.test.mjs`:
```js
import { describe, it, expect } from "vitest";
import { shouldFillLyrics, normalizeLyrics } from "./lyrics-ingest.mjs";

describe("shouldFillLyrics", () => {
  it("fills when current is empty and incoming is present", () => {
    expect(shouldFillLyrics("", "words")).toBe(true);
    expect(shouldFillLyrics(null, "words")).toBe(true);
    expect(shouldFillLyrics("   ", "words")).toBe(true);
  });
  it("never overwrites existing lyrics", () => {
    expect(shouldFillLyrics("old lyrics", "new lyrics")).toBe(false);
  });
  it("skips empty incoming", () => {
    expect(shouldFillLyrics("", "")).toBe(false);
    expect(shouldFillLyrics("", "   ")).toBe(false);
  });
});

describe("normalizeLyrics", () => {
  it("trims and nulls empties", () => {
    expect(normalizeLyrics("  hi there  ")).toBe("hi there");
    expect(normalizeLyrics("   ")).toBe(null);
    expect(normalizeLyrics(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scripts/lib/lyrics-ingest.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

`scripts/lib/lyrics-ingest.mjs`:
```js
// Pure helpers for lyrics ingestion — shared by the ingest CLI and its tests.
// Kept in plain .mjs so the CLI can run under Node with no build step.

/** Normalize a lyrics string for storage: trim; empty → null. */
export function normalizeLyrics(value) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

/**
 * Decide whether to write `incoming` lyrics onto a track whose current stored
 * value is `current`. Fill ONLY when the track has no lyrics yet and incoming is
 * non-empty. Never overwrite existing lyrics.
 */
export function shouldFillLyrics(current, incoming) {
  const cur = String(current ?? "").trim();
  const inc = String(incoming ?? "").trim();
  return cur.length === 0 && inc.length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/lib/lyrics-ingest.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the candidate exporter**

`scripts/export-lyric-candidates.mjs`:
```js
// Reads tracks whose lyrics are empty and writes lyric-candidates.json:
//   [{ trackId, name, primaryArtist, isrc }]
// READ-ONLY — makes no writes. Feeds scripts/musixmatch-pull-lyrics.py.
//
// Run (PowerShell): $env:NODE_OPTIONS="--use-system-ca"; node scripts/export-lyric-candidates.mjs
// Run (bash):       NODE_OPTIONS=--use-system-ca node scripts/export-lyric-candidates.mjs
//
// NOTE: local .env points at the LIVE database. This script only reads.
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();

try {
  const tracks = await prisma.track.findMany({
    where: { OR: [{ lyrics: null }, { lyrics: "" }] },
    select: { id: true, name: true, isrcCode: true, primaryArtistIds: true },
  });

  const ids = [...new Set(tracks.flatMap((t) => t.primaryArtistIds ?? []))];
  const artists = ids.length
    ? await prisma.artist.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(artists.map((a) => [a.id, a.name]));

  const candidates = tracks.map((t) => ({
    trackId: t.id,
    name: t.name,
    primaryArtist: (t.primaryArtistIds ?? [])
      .map((id) => nameById.get(id))
      .filter(Boolean)
      .join(", "),
    isrc: t.isrcCode ?? null,
  }));

  writeFileSync("lyric-candidates.json", JSON.stringify(candidates, null, 2));
  console.log(`Wrote ${candidates.length} candidates to lyric-candidates.json`);
} finally {
  await prisma.$disconnect();
}
```

- [ ] **Step 6: Ignore the generated JSON artifacts**

Append to `.gitignore`:
```
# Lyrics ingestion working files (may contain full lyrics — never commit)
lyric-candidates.json
lyrics-review.json
```

- [ ] **Step 7: Run the exporter (read-only, against the live DB)**

Run: `node --use-system-ca scripts/export-lyric-candidates.mjs`
Expected: prints "Wrote N candidates to lyric-candidates.json" (N ≈ 131 minus any already-populated), and the file exists with the shape above. This is read-only and safe.

- [ ] **Step 8: Commit (code only — the JSON is git-ignored)**

```bash
git --literal-pathspecs add scripts/lib/lyrics-ingest.mjs scripts/lib/lyrics-ingest.test.mjs scripts/export-lyric-candidates.mjs .gitignore
git commit -m "Lyrics ingest: fill-decision helpers + candidate exporter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Musixmatch pull script (Python)

Pulls the label's own lyrics for review. Network only, no DB writes.

**Files:**
- Create: `scripts/musixmatch-pull-lyrics.py`
- Create: `scripts/requirements.txt`

**Interfaces:**
- Consumes: `lyric-candidates.json` (Task 6).
- Produces: `lyrics-review.json`: `Array<{ trackId, name, artist, isrc, matchMethod, confidence, mxmTrackId, lyricsBody, notes }>` (consumed by Task 8).

- [ ] **Step 1: Pin the dependency**

`scripts/requirements.txt`:
```
musicxmatch_api
```

- [ ] **Step 2: Install it**

Run: `pip install -r scripts/requirements.txt`
Expected: `musicxmatch_api` installs. Confirm the class import name against the installed package (Strvm's wrapper; expected `from musicxmatch_api import MusixMatchAPI`) — adjust the import in Step 3 if the package exposes a different symbol.

- [ ] **Step 3: Write the pull script**

`scripts/musixmatch-pull-lyrics.py`:
```python
#!/usr/bin/env python3
"""Pull the label's own lyrics from Musixmatch for review. NETWORK ONLY — writes
no database. Reads lyric-candidates.json (from export-lyric-candidates.mjs) and
writes lyrics-review.json for a human to review before ingest.

Install:  pip install -r scripts/requirements.txt
Run:      python scripts/musixmatch-pull-lyrics.py

Caveats: uses an unofficial, reverse-engineered Musixmatch wrapper — ToS-gray and
liable to break without notice. Pulls only the label's OWN lyrics. See
docs/superpowers/specs/2026-07-08-lyrics-hub-design.md.
"""
import json
import time
from musicxmatch_api import MusixMatchAPI

api = MusixMatchAPI()


def norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum() or c == " ").strip()


def lyrics_from(resp):
    # Standard Musixmatch schema: message.body.lyrics.lyrics_body. Confirm against
    # a live response the first time (print resp) — it's a reverse-eng wrapper.
    try:
        body = resp["message"]["body"]["lyrics"]["lyrics_body"]
        return body.strip() or None
    except (KeyError, TypeError, AttributeError):
        return None


def pull_by_isrc(isrc):
    try:
        return lyrics_from(api.get_track_lyrics(track_isrc=isrc)), None
    except Exception:
        return None, None


def pull_by_search(title, artist):
    try:
        res = api.search_tracks(f"{title} {artist}")
        hits = res["message"]["body"]["track_list"]
        nt, na = norm(title), norm(artist)
        for h in hits:
            tr = h["track"]
            if norm(tr.get("track_name")) == nt and na and na in norm(tr.get("artist_name")):
                tid = tr.get("track_id")
                return lyrics_from(api.get_track_lyrics(track_id=tid)), tid
    except Exception:
        pass
    return None, None


def main():
    with open("lyric-candidates.json", encoding="utf-8") as f:
        candidates = json.load(f)

    out = []
    for c in candidates:
        body, mxm_id, method, conf = None, None, "none", 0.0
        if c.get("isrc"):
            body, _ = pull_by_isrc(c["isrc"])
            if body:
                method, conf = "isrc", 1.0
        if not body:
            body, mxm_id = pull_by_search(c["name"], c.get("primaryArtist", ""))
            if body:
                method, conf = "search", 0.6
        out.append({
            "trackId": c["trackId"],
            "name": c["name"],
            "artist": c.get("primaryArtist", ""),
            "isrc": c.get("isrc"),
            "matchMethod": method,
            "confidence": conf,
            "mxmTrackId": mxm_id,
            "lyricsBody": body,
            "notes": "" if body else "no match / instrumental / restricted",
        })
        print("+" if body else ".", end="", flush=True)
        time.sleep(0.3)  # be polite; mirror genius-check.mjs

    with open("lyrics-review.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    found = sum(1 for o in out if o["lyricsBody"])
    print(f"\nWrote lyrics-review.json — {found}/{len(out)} matched.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Dogfood on a tiny slice first**

Before running the full catalogue, temporarily trim `lyric-candidates.json` to ONE flagship track that has an ISRC, run the script, and inspect `lyrics-review.json`:
```bash
python scripts/musixmatch-pull-lyrics.py
```
Expected: one entry with `matchMethod: "isrc"`, `confidence: 1.0`, and a `lyricsBody` containing the full lyrics. **If `lyricsBody` is null or partial,** print the raw `api.get_track_lyrics(...)` response once and correct the `lyrics_from`/search key paths (the wrapper is reverse-engineered — verifying the live JSON shape here is expected, not a failure). Restore the full candidates file once the shape is confirmed.

- [ ] **Step 5: Commit (script only — the JSON is git-ignored)**

```bash
git --literal-pathspecs add scripts/musixmatch-pull-lyrics.py scripts/requirements.txt
git commit -m "Lyrics ingest: Musixmatch pull script (review-gated, ISRC-first)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Ingest write script

Writes reviewed lyrics into `Track.lyrics` — dry-run by default, fill-empty-only.

**Files:**
- Create: `scripts/ingest-lyrics.mjs`

**Interfaces:**
- Consumes: `lyrics-review.json` (Task 7); `shouldFillLyrics`, `normalizeLyrics` (Task 6).

- [ ] **Step 1: Write the ingest CLI**

`scripts/ingest-lyrics.mjs`:
```js
// Writes reviewed lyrics into Track.lyrics. DB ONLY — no network.
// Fills ONLY empty lyrics; never overwrites. Dry-run by default.
//
//   node --use-system-ca scripts/ingest-lyrics.mjs           # dry run (default)
//   node --use-system-ca scripts/ingest-lyrics.mjs --write   # persist
//
// NOTE: local .env points at the LIVE database. Review lyrics-review.json first.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { shouldFillLyrics, normalizeLyrics } from "./lib/lyrics-ingest.mjs";

const WRITE = process.argv.includes("--write");
const prisma = new PrismaClient();

try {
  const review = JSON.parse(readFileSync("lyrics-review.json", "utf-8"));
  let toFill = 0;
  let skippedPresent = 0;
  let skippedNoMatch = 0;

  for (const r of review) {
    const incoming = normalizeLyrics(r.lyricsBody);
    if (!incoming) {
      skippedNoMatch++;
      continue;
    }
    const track = await prisma.track.findUnique({
      where: { id: r.trackId },
      select: { lyrics: true, name: true },
    });
    if (!track) {
      skippedNoMatch++;
      continue;
    }
    if (!shouldFillLyrics(track.lyrics, incoming)) {
      skippedPresent++;
      continue;
    }
    toFill++;
    console.log(`${WRITE ? "WRITE" : "DRY  "} ${track.name} — ${incoming.length} chars`);
    if (WRITE) {
      await prisma.track.update({ where: { id: r.trackId }, data: { lyrics: incoming } });
    }
  }

  console.log(
    `\n${WRITE ? "Wrote" : "Would fill"} ${toFill}; skipped ${skippedPresent} already-present, ${skippedNoMatch} no-match.`
  );
  if (!WRITE) console.log("Dry run — re-run with --write to persist.");
} finally {
  await prisma.$disconnect();
}
```

- [ ] **Step 2: Dry-run it**

With a reviewed `lyrics-review.json` present:
Run: `node --use-system-ca scripts/ingest-lyrics.mjs`
Expected: prints `DRY` lines and a summary like "Would fill N; skipped M already-present, K no-match." — and **writes nothing** to the DB. Verify a track's lyrics are still empty via the admin editor.

- [ ] **Step 3: Typecheck the touched TS surface**

Run: `npx tsc --noEmit`
Expected: no errors (the `.mjs` scripts aren't typechecked, but this confirms Tasks 2–5 remain clean).

- [ ] **Step 4: Commit**

```bash
git --literal-pathspecs add scripts/ingest-lyrics.mjs
git commit -m "Lyrics ingest: write reviewed lyrics into Track.lyrics (dry-run default)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Full-pipeline dogfood (operator, deliberate)**

This is the end-to-end proof, run once by the operator (touches the live DB):
1. `node --use-system-ca scripts/export-lyric-candidates.mjs`
2. `python scripts/musixmatch-pull-lyrics.py`
3. Review `lyrics-review.json` — delete/edit any wrong or community-edited matches.
4. `node --use-system-ca scripts/ingest-lyrics.mjs` (dry run) → sanity-check the counts.
5. `node --use-system-ca scripts/ingest-lyrics.mjs --write` → persist.
6. Load a filled track's release page: lyrics render in the ⋯ dialog; `view-source` shows `MusicRecording.lyrics`; the tracks editor header shows increased coverage.

---

## Notes for the executor

- **Task order matters:** Task 2 must precede Tasks 3 and 5 (they depend on `lyrics` being on the public DTO). Task 6 must precede Task 8 (shared helpers). Otherwise tasks are independent.
- **Surface side (2–5) is safe and self-contained;** the pull side (6–8) touches the live DB and an unofficial API — keep the dry-run/fill-empty-only guarantees intact.
- **Never commit `lyric-candidates.json` or `lyrics-review.json`** (they hold full lyrics) — they're git-ignored in Task 6.
