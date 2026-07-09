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
