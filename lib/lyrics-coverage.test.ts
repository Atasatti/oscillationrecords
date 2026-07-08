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
