import { describe, it, expect } from "vitest";
import { groupAssets, buildDownloadItems, type GroupableAsset, type GroupContext } from "@/lib/asset-grouping";

const a = (o: Partial<GroupableAsset>): GroupableAsset => ({
  id: "1", category: "artwork", title: "t", fileName: "t.jpg", fileUrl: "https://x/t.jpg",
  downloadHref: "https://x/t.jpg",
  releaseId: null, artistId: null, parentLabel: null, parentHref: null,
  createdAt: "2026-07-02T00:00:00.000Z", ...o,
});
const ctx: GroupContext = {
  releaseNames: new Map([["r1", "Benert Remixes"]]),
  artistNames: new Map([["ar1", "Benert"]]),
  releaseArtistId: new Map([["r1", "ar1"]]),
  categoryLabels: { artwork: "Artwork", master: "Master", stems: "Stems" },
};

describe("groupAssets — release", () => {
  it("buckets by releaseId; release-less assets go to a 'Not linked' bucket sorted last", () => {
    const groups = groupAssets([a({ id: "u", releaseId: null }), a({ id: "z", releaseId: "r1" })], "release", ctx);
    expect(groups.map((g) => g.name)).toEqual(["Benert Remixes", "Not linked to a release"]);
    expect(groups[0]!.entityId).toBe("r1");
  });
  it("release name falls back to parentLabel when not in the map", () => {
    const groups = groupAssets([a({ releaseId: "r2", parentLabel: "Fallback" })], "release", ctx);
    expect(groups[0]!.name).toBe("Fallback");
  });
});

describe("groupAssets — artist", () => {
  it("uses the asset's artistId, else the release's primary artist; the rest go to 'No artist'", () => {
    const groups = groupAssets([
      a({ id: "photo", artistId: "ar1" }),
      a({ id: "cover", releaseId: "r1" }), // resolves to ar1 via releaseArtistId
      a({ id: "orphan" }),
    ], "artist", ctx);
    const benert = groups.find((g) => g.name === "Benert");
    expect(benert!.assets.map((x) => x.id).sort()).toEqual(["cover", "photo"]);
    expect(groups.at(-1)!.name).toBe("No artist");
  });
});

describe("groupAssets — month", () => {
  it("buckets by upload month, newest first", () => {
    const groups = groupAssets([
      a({ id: "jun", createdAt: "2026-06-15T00:00:00.000Z" }),
      a({ id: "jul", createdAt: "2026-07-02T00:00:00.000Z" }),
    ], "month", ctx);
    expect(groups.map((g) => g.name)).toEqual(["July 2026", "June 2026"]);
  });
});

describe("groupAssets — type", () => {
  it("buckets by category using the label map", () => {
    const groups = groupAssets([a({ id: "m", category: "master" }), a({ id: "art", category: "artwork" })], "type", ctx);
    expect(groups.map((g) => g.name)).toEqual(["Artwork", "Master"]);
  });
});

describe("buildDownloadItems", () => {
  it("one item per file; disambiguates a repeated category by name; lyrics only for release groups", () => {
    const group = groupAssets([
      a({ id: "1", category: "artwork", title: "cover", fileName: "cover.jpg", releaseId: "r1" }),
      a({ id: "2", category: "master", title: "T1", fileName: "t1.wav", releaseId: "r1" }),
      a({ id: "3", category: "master", title: "T2", fileName: "t2.wav", releaseId: "r1" }),
    ], "release", ctx)[0]!;
    const items = buildDownloadItems(group, { txt: true, lrc: false }, ctx.categoryLabels);
    expect(items.map((i) => i.label)).toEqual([
      "Download Artwork", "Download Master — T1", "Download Master — T2", "Download lyrics (.txt)",
    ]);
    expect(items[0]!.downloadName).toBe("cover.jpg");
  });
  it("no lyrics items for non-release groups", () => {
    const group = groupAssets([a({ artistId: "ar1" })], "artist", ctx)[0]!;
    expect(buildDownloadItems(group, { txt: true, lrc: true }, ctx.categoryLabels)
      .some((i) => i.href.includes("/lyrics"))).toBe(false);
  });
});
