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
