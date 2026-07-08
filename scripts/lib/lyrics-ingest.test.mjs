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
