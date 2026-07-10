# Consolidated per-release downloads (Asset library) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Asset library, add a "By release" view that groups a release's scattered asset cards into one consolidated download control (⋯ menu / direct button / "No downloads available"), including synthesized lyrics (`.txt`/`.lrc`) downloads.

**Architecture:** Pure, unit-tested helpers do the real work — a store-only ZIP writer (`lib/zip.ts`), lyrics synthesis (`lib/lyrics-export.ts`), and asset grouping + download-item building (`lib/asset-grouping.ts`). A thin route (`/api/releases/[id]/lyrics`) wires Prisma to the lyrics helpers. A presentational `AssetActions` component renders the 0/1/2+ control. The assets page passes per-release lyrics-availability flags; `AssetsClient` gains a `Files | By release` toggle and the grouped view.

**Tech Stack:** Next.js 15 App Router, React client components, Prisma/MongoDB, Radix `DropdownMenu`, Vitest (node env, pure units), lucide-react icons.

## Global Constraints

- `tsconfig.json` has `noUncheckedIndexedAccess: true` — every indexed access (`arr[i]`, `map[k]`) is `T | undefined`. All new code must be written undefined-safe (guards, `??`, or a justified `!` after a length check).
- Vitest is **node environment, pure functions only** (`vitest.config.ts`) — unit-test pure helpers; verify React/route code via `tsc` + `next lint` + browser.
- Commit messages MUST end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Never `git add -A`; stage explicit paths. The lyrics route path contains `[brackets]` — stage it with `git --literal-pathspecs add -- "app/api/releases/[releaseId]/lyrics/route.ts"`.
- Type-check with `npx tsc --noEmit`. **NOTE:** the tree is temporarily red from another agent's `noUncheckedIndexedAccess` migration — after running tsc, confirm **your** files aren't in the output (e.g. `npx tsc --noEmit 2>&1 | grep -E "zip|lyrics-export|asset-grouping|AssetActions|assets/"`), don't try to fix unrelated migration errors.
- Lint per file: `npx next lint --file <path>`.
- Tasks 6 & 7 edit `app/admin/catalog/assets/page.tsx` and `AssetsClient.tsx`, which the other agent has in-progress edits in. **Re-read each file immediately before editing** and apply changes on top of its current state.

---

### Task 1: Store-only ZIP writer

**Files:**
- Create: `lib/zip.ts`
- Test: `lib/zip.test.ts`

**Interfaces:**
- Produces: `crc32(bytes: Uint8Array): number`, `storeZip(entries: { name: string; data: string | Uint8Array }[]): Buffer` (and `type ZipEntry`).

- [ ] **Step 1: Write the failing test**

```ts
// lib/zip.test.ts
import { describe, it, expect } from "vitest";
import { crc32, storeZip } from "@/lib/zip";

const u8 = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches known CRC-32 values", () => {
    expect(crc32(u8(""))).toBe(0);
    expect(crc32(u8("hello")).toString(16)).toBe("3610a686");
  });
});

describe("storeZip", () => {
  it("empty archive is just a 22-byte EOCD", () => {
    const z = storeZip([]);
    expect(z.length).toBe(22);
    expect(z.readUInt32LE(0)).toBe(0x06054b50); // EOCD signature
    expect(z.readUInt16LE(10)).toBe(0); // total entries
  });

  it("one entry: local header, stored size/crc, filename, EOCD count", () => {
    const z = storeZip([{ name: "a.lrc", data: "hello" }]);
    expect(z.readUInt32LE(0)).toBe(0x04034b50); // local file header
    expect(z.readUInt16LE(8)).toBe(0); // method 0 = store
    expect(z.readUInt32LE(14)).toBe(crc32(u8("hello")));
    expect(z.readUInt32LE(18)).toBe(5); // compressed size
    expect(z.readUInt32LE(22)).toBe(5); // uncompressed size
    expect(z.subarray(30, 35).toString("utf8")).toBe("a.lrc");
    expect(z.subarray(35, 40).toString("utf8")).toBe("hello");
    // EOCD is the last 22 bytes; entry count = 1.
    expect(z.readUInt16LE(z.length - 12)).toBe(1);
  });

  it("two entries → EOCD count 2", () => {
    const z = storeZip([{ name: "1.lrc", data: "a" }, { name: "2.lrc", data: "bb" }]);
    expect(z.readUInt16LE(z.length - 12)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/zip.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/zip"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/zip.ts
// Minimal store-only (no compression) ZIP writer — enough to bundle a handful of
// small text files (per-track .lrc) with zero runtime dependencies. Not a general
// archiver: no deflate, no zip64, no unicode flag (names are ASCII-safe here).

export type ZipEntry = { name: string; data: string | Uint8Array };

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function storeZip(entries: ZipEntry[]): Buffer {
  const enc = new TextEncoder();
  const files = entries.map((e) => ({
    nameBytes: enc.encode(e.name),
    data: typeof e.data === "string" ? enc.encode(e.data) : e.data,
  }));

  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const crc = crc32(f.data);
    const size = f.data.length;

    const lh = Buffer.alloc(30 + f.nameBytes.length);
    lh.writeUInt32LE(0x04034b50, 0); // local file header signature
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(0, 8); // method 0 = store
    lh.writeUInt16LE(0, 10); // mod time
    lh.writeUInt16LE(0, 12); // mod date
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(size, 18); // compressed size
    lh.writeUInt32LE(size, 22); // uncompressed size
    lh.writeUInt16LE(f.nameBytes.length, 26);
    lh.writeUInt16LE(0, 28); // extra length
    Buffer.from(f.nameBytes).copy(lh, 30);
    local.push(lh, Buffer.from(f.data));

    const cd = Buffer.alloc(46 + f.nameBytes.length);
    cd.writeUInt32LE(0x02014b50, 0); // central directory header signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(0, 10); // method
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(f.nameBytes.length, 28);
    cd.writeUInt16LE(0, 30); // extra length
    cd.writeUInt16LE(0, 32); // comment length
    cd.writeUInt16LE(0, 34); // disk number
    cd.writeUInt16LE(0, 36); // internal attrs
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42); // relative offset of local header
    Buffer.from(f.nameBytes).copy(cd, 46);
    central.push(cd);

    offset += lh.length + size;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // this disk
  eocd.writeUInt16LE(0, 6); // central dir start disk
  eocd.writeUInt16LE(files.length, 8); // entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...local, centralBuf, eocd]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/zip.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -- lib/zip.ts lib/zip.test.ts
git commit -m "Add store-only zip writer (lib/zip)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Lyrics synthesis helpers

**Files:**
- Create: `lib/lyrics-export.ts`
- Test: `lib/lyrics-export.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type LyricsTrack = { name: string; lyrics?: string | null; syncedLyrics?: string | null }`
  - `buildLyricsTxt(tracks: LyricsTrack[]): string` — combined plain-text; `""` when no track has lyrics.
  - `buildLrcEntries(tracks: LyricsTrack[]): { name: string; data: string }[]` — one `.lrc` per synced track (name like `01 Track.lrc`); `[]` when none.

- [ ] **Step 1: Write the failing test**

```ts
// lib/lyrics-export.test.ts
import { describe, it, expect } from "vitest";
import { buildLyricsTxt, buildLrcEntries } from "@/lib/lyrics-export";

describe("buildLyricsTxt", () => {
  it("numbers only tracks that have lyrics", () => {
    const txt = buildLyricsTxt([
      { name: "One", lyrics: "la la" },
      { name: "Two (instrumental)", lyrics: "  " },
      { name: "Three", lyrics: "do re" },
    ]);
    expect(txt).toContain("01. One");
    expect(txt).toContain("la la");
    expect(txt).toContain("02. Three"); // Two skipped → Three is 02
    expect(txt).not.toContain("Two (instrumental)");
  });
  it("returns empty string when nothing has lyrics", () => {
    expect(buildLyricsTxt([{ name: "x", lyrics: null }, { name: "y" }])).toBe("");
  });
});

describe("buildLrcEntries", () => {
  it("one entry per synced track, sanitized names", () => {
    const e = buildLrcEntries([
      { name: "A/B: song", syncedLyrics: "[00:01.00]hi" },
      { name: "no timing", syncedLyrics: "" },
      { name: "C", syncedLyrics: "[00:02.00]yo" },
    ]);
    expect(e).toHaveLength(2);
    expect(e[0]!.name).toBe("01 A_B_ song.lrc");
    expect(e[0]!.data).toBe("[00:01.00]hi");
    expect(e[1]!.name).toBe("02 C.lrc");
  });
  it("empty when no synced lyrics", () => {
    expect(buildLrcEntries([{ name: "x" }, { name: "y", syncedLyrics: "  " }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/lyrics-export.test.ts`
Expected: FAIL — cannot resolve `@/lib/lyrics-export`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/lyrics-export.ts
// Synthesize downloadable lyrics files from a release's tracks. Lyrics live as
// text on the Track (plain `lyrics`, LRC `syncedLyrics`), not as stored files.

export type LyricsTrack = {
  name: string;
  lyrics?: string | null;
  syncedLyrics?: string | null;
};

/** Combined plain-text of every track that has lyrics; "" if none. */
export function buildLyricsTxt(tracks: LyricsTrack[]): string {
  const parts: string[] = [];
  let n = 0;
  for (const t of tracks) {
    const lyr = (t.lyrics ?? "").trim();
    if (!lyr) continue;
    n += 1;
    parts.push(`${String(n).padStart(2, "0")}. ${t.name}\n\n${lyr}\n`);
  }
  return parts.join("\n");
}

/** One .lrc entry per track with synced timing; [] if none. */
export function buildLrcEntries(tracks: LyricsTrack[]): { name: string; data: string }[] {
  const out: { name: string; data: string }[] = [];
  let n = 0;
  for (const t of tracks) {
    const lrc = (t.syncedLyrics ?? "").trim();
    if (!lrc) continue;
    n += 1;
    const safe = t.name.replace(/[^\w.\- ]+/g, "_").trim() || "track";
    out.push({ name: `${String(n).padStart(2, "0")} ${safe}.lrc`, data: lrc });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/lyrics-export.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -- lib/lyrics-export.ts lib/lyrics-export.test.ts
git commit -m "Add lyrics synthesis helpers (txt + per-track lrc)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Lyrics download endpoint

**Files:**
- Create: `app/api/releases/[releaseId]/lyrics/route.ts`

**Interfaces:**
- Consumes: `buildLyricsTxt`, `buildLrcEntries` (Task 2); `storeZip` (Task 1); `slugify` from `@/lib/slug`; `requirePermission` from `@/lib/auth-guard`; `prisma`.
- Produces: `GET` handler returning `text/plain` (txt or single lrc) or `application/zip` (multi lrc) as an attachment; `404` when nothing to export.

- [ ] **Step 1: Write the route**

```ts
// app/api/releases/[releaseId]/lyrics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { slugify } from "@/lib/slug";
import { buildLyricsTxt, buildLrcEntries } from "@/lib/lyrics-export";
import { storeZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/lyrics?format=txt|lrc — synthesize a downloadable
// lyrics file from the release's tracks. Admin-only (lyrics/synced timing are
// internal). 404 when the requested format has nothing to export.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;

  const { releaseId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "lrc" ? "lrc" : "txt";

  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      name: true,
      tracks: {
        orderBy: { sortOrder: "asc" },
        select: { name: true, lyrics: true, syncedLyrics: true },
      },
    },
  });
  if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

  const base = slugify(release.name) || "release";

  if (format === "txt") {
    const txt = buildLyricsTxt(release.tracks);
    if (!txt) return NextResponse.json({ error: "No lyrics" }, { status: 404 });
    return new NextResponse(txt, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-lyrics.txt"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const entries = buildLrcEntries(release.tracks);
  if (entries.length === 0) return NextResponse.json({ error: "No synced lyrics" }, { status: 404 });

  const [only] = entries;
  if (entries.length === 1 && only) {
    return new NextResponse(only.data, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${only.name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const zip = storeZip(entries);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${base}-lrc.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "releases/\[releaseId\]/lyrics" || echo "clean"`
Expected: `clean` (no errors in this file).

- [ ] **Step 3: Lint**

Run: `npx next lint --file "app/api/releases/[releaseId]/lyrics/route.ts"`
Expected: no errors.

- [ ] **Step 4: Manual smoke test (dev server running)**

With a real release id that has lyrics, in the authenticated admin browser console:
```js
await (await fetch("/api/releases/<REAL_ID>/lyrics?format=txt")).text() // → combined lyrics text
(await fetch("/api/releases/<REAL_ID>/lyrics?format=lrc")).headers.get("content-type") // "text/plain..." or "application/zip"
(await fetch("/api/releases/<NO_LYRICS_ID>/lyrics?format=txt")).status // 404
```
Expected: text returned for txt; a content-type for lrc; 404 when absent. (Read-only — no DB writes.)

- [ ] **Step 5: Commit**

```bash
git --literal-pathspecs add -- "app/api/releases/[releaseId]/lyrics/route.ts"
git commit -m "Add lyrics download endpoint (txt / lrc / zip)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Asset grouping + download-item helpers

**Files:**
- Create: `lib/asset-grouping.ts`
- Test: `lib/asset-grouping.test.ts`

**Interfaces:**
- Consumes: nothing (structural types only, to stay decoupled from the client `Asset`).
- Produces:
  - `type GroupableAsset = { id; category; title; fileName; fileUrl; releaseId: string | null; artistId: string | null; parentLabel: string | null; parentHref: string | null }`
  - `type AssetGroup = { key: string; kind: "release" | "artist" | "unlinked"; entityId: string | null; name: string; href: string | null; assets: GroupableAsset[] }`
  - `type DownloadItem = { label: string; href: string; downloadName?: string }`
  - `groupAssets(assets: GroupableAsset[], names: { releases: Map<string,string>; artists: Map<string,string> }): AssetGroup[]`
  - `buildDownloadItems(group: AssetGroup, lyrics: { txt: boolean; lrc: boolean } | undefined, categoryLabels: Record<string, string>): DownloadItem[]`

- [ ] **Step 1: Write the failing test**

```ts
// lib/asset-grouping.test.ts
import { describe, it, expect } from "vitest";
import { groupAssets, buildDownloadItems, type GroupableAsset } from "@/lib/asset-grouping";

const a = (o: Partial<GroupableAsset>): GroupableAsset => ({
  id: "1", category: "artwork", title: "t", fileName: "t.jpg", fileUrl: "https://x/t.jpg",
  releaseId: null, artistId: null, parentLabel: null, parentHref: null, ...o,
});
const names = { releases: new Map([["r1", "Benert Remixes"]]), artists: new Map([["ar1", "Benert"]]) };
const LABELS = { artwork: "Artwork", master: "Master", stems: "Stems" };

describe("groupAssets", () => {
  it("buckets by release, then artist, then unlinked; releases first, name-sorted", () => {
    const groups = groupAssets(
      [
        a({ id: "u", releaseId: null, artistId: null }),
        a({ id: "z", releaseId: "r1" }),
        a({ id: "m", artistId: "ar1" }),
      ],
      names
    );
    expect(groups.map((g) => g.kind)).toEqual(["release", "artist", "unlinked"]);
    expect(groups[0]!.name).toBe("Benert Remixes");
    expect(groups[0]!.entityId).toBe("r1");
  });
  it("names fall back to parentLabel when not in the map", () => {
    const groups = groupAssets([a({ releaseId: "r2", parentLabel: "Fallback" })], names);
    expect(groups[0]!.name).toBe("Fallback");
  });
});

describe("buildDownloadItems", () => {
  it("one item per file; disambiguates by name only when a category repeats", () => {
    const group = groupAssets(
      [
        a({ id: "1", category: "artwork", title: "cover", fileName: "cover.jpg", releaseId: "r1" }),
        a({ id: "2", category: "master", title: "T1", fileName: "t1.wav", releaseId: "r1" }),
        a({ id: "3", category: "master", title: "T2", fileName: "t2.wav", releaseId: "r1" }),
      ],
      names
    )[0]!;
    const items = buildDownloadItems(group, undefined, LABELS);
    expect(items.map((i) => i.label)).toEqual([
      "Download Artwork",
      "Download Master — T1",
      "Download Master — T2",
    ]);
    expect(items[0]!.downloadName).toBe("cover.jpg");
  });
  it("appends lyrics items for release groups per flags", () => {
    const group = groupAssets([a({ releaseId: "r1" })], names)[0]!;
    const items = buildDownloadItems(group, { txt: true, lrc: true }, LABELS);
    expect(items.some((i) => i.href === "/api/releases/r1/lyrics?format=txt")).toBe(true);
    expect(items.some((i) => i.href === "/api/releases/r1/lyrics?format=lrc")).toBe(true);
  });
  it("no lyrics items for artist/unlinked groups even with flags", () => {
    const group = groupAssets([a({ artistId: "ar1" })], names)[0]!;
    expect(buildDownloadItems(group, { txt: true, lrc: true }, LABELS)
      .some((i) => i.href.includes("/lyrics"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/asset-grouping.test.ts`
Expected: FAIL — cannot resolve `@/lib/asset-grouping`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/asset-grouping.ts
// Pure helpers for the Asset library's "By release" view: bucket assets by their
// linked entity and turn a bucket into a flat list of download actions.

export type GroupableAsset = {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  releaseId: string | null;
  artistId: string | null;
  parentLabel: string | null;
  parentHref: string | null;
};

export type AssetGroup = {
  key: string;
  kind: "release" | "artist" | "unlinked";
  entityId: string | null;
  name: string;
  href: string | null;
  assets: GroupableAsset[];
};

export type DownloadItem = { label: string; href: string; downloadName?: string };

export function groupAssets(
  assets: GroupableAsset[],
  names: { releases: Map<string, string>; artists: Map<string, string> }
): AssetGroup[] {
  const groups = new Map<string, AssetGroup>();
  for (const asset of assets) {
    let g: Omit<AssetGroup, "assets">;
    if (asset.releaseId) {
      g = {
        key: `release:${asset.releaseId}`,
        kind: "release",
        entityId: asset.releaseId,
        name: names.releases.get(asset.releaseId) ?? asset.parentLabel ?? "Untitled release",
        href: asset.parentHref ?? `/admin/catalog/release/${asset.releaseId}`,
      };
    } else if (asset.artistId) {
      g = {
        key: `artist:${asset.artistId}`,
        kind: "artist",
        entityId: asset.artistId,
        name: names.artists.get(asset.artistId) ?? asset.parentLabel ?? "Unknown artist",
        href: asset.parentHref ?? `/admin/catalog/artist/${asset.artistId}`,
      };
    } else {
      g = { key: "unlinked", kind: "unlinked", entityId: null, name: "Not linked to a release", href: null };
    }
    const existing = groups.get(g.key);
    if (existing) existing.assets.push(asset);
    else groups.set(g.key, { ...g, assets: [asset] });
  }
  const rank = (k: AssetGroup["kind"]) => (k === "release" ? 0 : k === "artist" ? 1 : 2);
  return [...groups.values()].sort(
    (x, y) => rank(x.kind) - rank(y.kind) || x.name.localeCompare(y.name)
  );
}

export function buildDownloadItems(
  group: AssetGroup,
  lyrics: { txt: boolean; lrc: boolean } | undefined,
  categoryLabels: Record<string, string>
): DownloadItem[] {
  const counts = new Map<string, number>();
  for (const asset of group.assets) {
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
  }
  const items: DownloadItem[] = group.assets.map((asset) => {
    const catLabel = categoryLabels[asset.category] ?? asset.category;
    const disambiguate = (counts.get(asset.category) ?? 0) > 1;
    return {
      label: disambiguate ? `Download ${catLabel} — ${asset.title || asset.fileName}` : `Download ${catLabel}`,
      href: asset.fileUrl,
      downloadName: asset.fileName,
    };
  });
  if (group.kind === "release" && group.entityId && lyrics) {
    if (lyrics.txt) items.push({ label: "Download lyrics (.txt)", href: `/api/releases/${group.entityId}/lyrics?format=txt` });
    if (lyrics.lrc) items.push({ label: "Download lyrics (.lrc)", href: `/api/releases/${group.entityId}/lyrics?format=lrc` });
  }
  return items;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/asset-grouping.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -- lib/asset-grouping.ts lib/asset-grouping.test.ts
git commit -m "Add asset grouping + download-item helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `AssetActions` control

**Files:**
- Create: `components/admin/AssetActions.tsx`

**Interfaces:**
- Consumes: `type DownloadItem` (Task 4); `Button`, `DropdownMenu*`, lucide icons.
- Produces: `export default function AssetActions({ items }: { items: DownloadItem[] })`.

- [ ] **Step 1: Write the component**

```tsx
// components/admin/AssetActions.tsx
"use client";

import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { DownloadItem } from "@/lib/asset-grouping";

// Consolidated download control for a group of assets:
//  • 0 items → ⋯ menu showing a disabled "No downloads available"
//  • 1 item  → a direct Download button
//  • 2+ items → a ⋯ "Download" menu, one entry per item
export default function AssetActions({ items }: { items: DownloadItem[] }) {
  const [only] = items;
  if (items.length === 1 && only) {
    return (
      <a
        href={only.href}
        download={only.downloadName}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
      >
        <Download className="h-3.5 w-3.5" /> Download
      </a>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Download <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[16rem]">
        {items.length === 0 ? (
          <DropdownMenuItem disabled>No downloads available</DropdownMenuItem>
        ) : (
          items.map((it, i) => (
            <DropdownMenuItem key={`${it.href}-${i}`} asChild>
              <a href={it.href} download={it.downloadName} target="_blank" rel="noopener noreferrer" className="truncate">
                {it.label}
              </a>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep "AssetActions" || echo "clean"` → expect `clean`
Run: `npx next lint --file components/admin/AssetActions.tsx` → expect no errors.

- [ ] **Step 3: Commit**

```bash
git add -- components/admin/AssetActions.tsx
git commit -m "Add reusable AssetActions download control (none/direct/menu)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Per-release lyrics flags from the assets page

**Files:**
- Modify: `app/admin/catalog/assets/page.tsx`

**Interfaces:**
- Produces: passes `releaseLyrics: Record<string, { txt: boolean; lrc: boolean }>` to `AssetsClient` (consumed in Task 7).

- [ ] **Step 1: Re-read the file**

Run: `sed -n '20,94p' app/admin/catalog/assets/page.tsx` (the other agent may have edited it).

- [ ] **Step 2: Add `lyrics`/`syncedLyrics` to the existing tracks select**

In the `prisma.release.findMany` call, change the tracks select to include lyrics fields:

```ts
        tracks: { select: { id: true, name: true, audioFile: true, stemsFile: true, image: true, lyrics: true, syncedLyrics: true } },
```

- [ ] **Step 3: Declare and compute `releaseLyrics`**

Add to the top-level declarations (next to `assets`/`releases`/`artists`):

```ts
  let releaseLyrics: Record<string, { txt: boolean; lrc: boolean }> = {};
```

Inside the `try`, right after `releases = rels.map(...)` / `artists = arts.map(...)`:

```ts
    releaseLyrics = {};
    for (const r of rels) {
      const txt = r.tracks.some((t) => (t.lyrics ?? "").trim() !== "");
      const lrc = r.tracks.some((t) => (t.syncedLyrics ?? "").trim() !== "");
      if (txt || lrc) releaseLyrics[r.id] = { txt, lrc };
    }
```

- [ ] **Step 4: Pass the prop**

```tsx
  return <AssetsClient initial={assets} releases={releases} artists={artists} releaseLyrics={releaseLyrics} />;
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep "assets/page" || echo "clean"`
Expected: `clean`. (It will report `AssetsClient` missing the `releaseLyrics` prop only until Task 7 adds it — acceptable to type-check page + client together at the end of Task 7; if you implement in order, this line is expected until then.)

- [ ] **Step 6: Commit**

```bash
git add -- app/admin/catalog/assets/page.tsx
git commit -m "Assets page: compute per-release lyrics-availability flags

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: "By release" view in `AssetsClient`

**Files:**
- Modify: `app/admin/catalog/assets/AssetsClient.tsx`

**Interfaces:**
- Consumes: `groupAssets`, `buildDownloadItems`, `type DownloadItem` (Task 4); `AssetActions` (Task 5); `releaseLyrics` prop (Task 6); existing `ASSET_CATEGORY_LABELS`, `visible`, `nameOf`.

- [ ] **Step 1: Re-read the file**

Run: `sed -n '1,20p;85,150p;300,386p' app/admin/catalog/assets/AssetsClient.tsx` — confirm current imports, the props signature, the `visible` memo, and the grid render (the other agent may have adjusted types).

- [ ] **Step 2: Add imports**

After the existing `@/lib/asset` import:

```ts
import AssetActions from "@/components/admin/AssetActions";
import { groupAssets, buildDownloadItems } from "@/lib/asset-grouping";
```

- [ ] **Step 3: Accept the new prop**

Change the component signature to accept `releaseLyrics` (default `{}` so callers/tests without it still work):

```tsx
export default function AssetsClient({
  initial, releases, artists, releaseLyrics = {},
}: {
  initial: Asset[];
  releases: Option[];
  artists: Option[];
  releaseLyrics?: Record<string, { txt: boolean; lrc: boolean }>;
}) {
```

- [ ] **Step 4: Add view state + name maps + groups memo**

Near the other `useState` hooks:

```tsx
  const [view, setView] = useState<"files" | "byRelease">("files");
```

After the existing `nameOf`/`visible` memos, add:

```tsx
  const releaseNames = useMemo(() => new Map(releases.map((r) => [r.id, r.name])), [releases]);
  const artistNames = useMemo(() => new Map(artists.map((a) => [a.id, a.name])), [artists]);
  const groups = useMemo(
    () => groupAssets(visible, { releases: releaseNames, artists: artistNames }),
    [visible, releaseNames, artistNames]
  );
```

- [ ] **Step 5: Add the `Files | By release` toggle**

Immediately before the `<div className="mb-4 flex flex-wrap items-center justify-between gap-3">` that holds the category `Segmented`, insert:

```tsx
      <div className="mb-4 inline-flex rounded-lg border border-border p-0.5">
        {([["files", "Files"], ["byRelease", "By release"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setView(k)}
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              view === k ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
```

- [ ] **Step 6: Render the grouped view**

Wrap the existing results block so it only renders in `files` view, and add the grouped view. Replace the existing `{visible.length === 0 ? (...) : (<div className="grid ...">...</div>)}` block with:

```tsx
      {view === "byRelease" ? (
        groups.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            {assets.length === 0 ? "No assets yet." : "No assets match."}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const lyrics = g.kind === "release" && g.entityId && filter === "all"
                ? releaseLyrics[g.entityId]
                : undefined;
              const items = buildDownloadItems(g, lyrics, ASSET_CATEGORY_LABELS);
              const summary = [...new Map(
                g.assets.reduce((m, a) => m.set(a.category, (m.get(a.category) ?? 0) + 1), new Map<string, number>())
              )]
                .map(([cat, n]) => `${ASSET_CATEGORY_LABELS[cat as AssetCategory] ?? cat}${n > 1 ? ` ×${n}` : ""}`)
                .join(" · ");
              return (
                <div key={g.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      {g.href ? (
                        <Link href={g.href} className="truncate font-medium hover:underline">{g.name}</Link>
                      ) : (
                        <span className="truncate font-medium">{g.name}</span>
                      )}
                      <p className="truncate text-xs text-muted-foreground">{summary}</p>
                    </div>
                    <AssetActions items={items} />
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-12 text-center text-sm text-muted-foreground">
          {assets.length === 0 ? "No assets yet. Upload masters, artwork, stems or press photos." : "No assets match."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* ...existing per-file card map, unchanged... */}
        </div>
      )}
```

Keep the existing per-file card `.map(...)` exactly as-is inside the final grid branch.

- [ ] **Step 7: Type-check + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E "assets/(page|AssetsClient)" || echo "clean"` → expect `clean`
Run: `npx next lint --file app/admin/catalog/assets/AssetsClient.tsx` → expect no errors.

- [ ] **Step 8: Browser verification (dev server, authenticated)**

Navigate to `/admin/catalog/assets`:
- Toggle `By release` → assets grouped under release names (then artists, then "Not linked to a release"), each with one Download control.
- A release with ≥2 files → ⋯ menu lists each ("Download Artwork", "Download Master — …", and — when it has lyrics — "Download lyrics (.txt)"/"(.lrc)").
- A group with exactly 1 file → direct Download button; download works.
- A group with 0 downloadable items (shouldn't normally happen since a group has ≥1 asset) → ⋯ shows "No downloads available".
- `Files` view unchanged. Verify `body`/menu don't get stuck after opening the ⋯ menu.

- [ ] **Step 9: Commit**

```bash
git add -- app/admin/catalog/assets/AssetsClient.tsx
git commit -m "Assets library: By-release view with consolidated downloads

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- View toggle → Task 7 (Step 5). ✓
- Grouping (release/artist/unlinked, ordering, name fallback) → Task 4 `groupAssets` + Task 7 render. ✓
- `AssetActions` 0/1/2+ behavior → Task 5. ✓
- Download items (files labeled + disambiguated; release lyrics items) → Task 4 `buildDownloadItems`. ✓
- Lyrics `.txt` combined; `.lrc` single-or-zip → Task 2 + Task 3. ✓
- Per-release `hasLyrics`/`hasSynced` flags → Task 6. ✓
- Endpoint `GET /api/releases/[id]/lyrics?format=txt|lrc`, attachment, 404 → Task 3. ✓
- Store-only zip, no new dependency → Task 1. ✓
- Category filter active → lyrics hidden; empty groups hidden → Task 7 (Step 6: `filter === "all"` guard; groups derive from `visible`). ✓
- Component boundaries (pure helpers isolated from the client) → Tasks 1/2/4 use structural types, no client import. ✓

**Placeholder scan:** none — all steps carry real code/commands.

**Type consistency:** `DownloadItem`, `AssetGroup`, `GroupableAsset` defined in Task 4 and consumed unchanged in Tasks 5/7; `buildLyricsTxt`/`buildLrcEntries`/`storeZip` signatures match between Tasks 1/2 and their use in Task 3; `releaseLyrics` shape identical in Tasks 6 and 7.

**Note on ordering:** Task 6's page will not fully type-check until Task 7 adds the `releaseLyrics` prop to `AssetsClient` — expected; do the final green `tsc` check after Task 7.
