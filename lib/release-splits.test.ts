import { describe, expect, it } from "vitest";
import { normalizeSplits, rowsToSplits, splitsProblem, summarizeSplits } from "./release-splits";

// splitsProblem is the server-side gate on the dedicated split saves (release
// Splits panel PUT, per-track edit dialog PATCH): a non-empty split must
// allocate EXACTLY 100%. The persistence half of the bug — the tracklist PATCH
// dropping submitted splits — is covered by the route change; these pin the
// validation rules it now shares.

const split = (name: string, percent: number, artistId: string | null = null) => ({
  artistId,
  name,
  realName: null,
  email: null,
  percent,
});

describe("splitsProblem", () => {
  it("accepts an empty list (no agreement recorded)", () => {
    expect(splitsProblem([])).toBeNull();
  });

  it("accepts an exact 100% allocation", () => {
    expect(splitsProblem([split("A", 60), split("B", 40)])).toBeNull();
    expect(splitsProblem([split("Solo", 100)])).toBeNull();
  });

  it("accepts a three-way 100% with two-decimal rounding", () => {
    // 33.33 + 33.33 + 33.34 — the equal-divide result for 3 payees.
    expect(splitsProblem([split("A", 33.33), split("B", 33.33), split("C", 33.34)])).toBeNull();
  });

  it("rejects an under-allocated split, naming the actual total", () => {
    expect(splitsProblem([split("A", 60)])).toContain("60%");
    expect(splitsProblem([split("A", 99.99)])).toContain("99.99%");
  });

  it("rejects an over-allocated split", () => {
    // normalizeSplits clamps each row to 100, so overshoot comes from the SUM.
    expect(splitsProblem([split("A", 60), split("B", 60)])).toContain("120%");
  });

  it("catches float-drift sums instead of letting 99.999… pass as 100", () => {
    // 3 × 33.33 = 99.99, not 100 — must be rejected, not glossed by float noise.
    expect(splitsProblem([split("A", 33.33), split("B", 33.33), split("C", 33.33)])).not.toBeNull();
  });
});

describe("normalizeSplits (the shape every save runs through)", () => {
  it("drops nameless rows and clamps percents into 0–100", () => {
    const out = normalizeSplits([
      { name: "", percent: 50 },
      { name: "Real", percent: 250 },
      { name: "Neg", percent: -10 },
      { name: "NaN", percent: "abc" },
    ]);
    expect(out.map((s) => [s.name, s.percent])).toEqual([
      ["Real", 100],
      ["Neg", 0],
      ["NaN", 0],
    ]);
  });

  it("keeps a linked artistId and trims strings", () => {
    const out = normalizeSplits([
      { artistId: " 507f1f77bcf86cd799439011 ", name: "  BSK  ", percent: 100 },
    ]);
    expect(out[0]).toMatchObject({ artistId: "507f1f77bcf86cd799439011", name: "BSK", percent: 100 });
  });

  it("reads the legacy { payee } shape", () => {
    expect(normalizeSplits([{ payee: "Old Row", percent: 100 }])[0]?.name).toBe("Old Row");
  });
});

describe("rowsToSplits + summarize round trip", () => {
  it("an equal two-way editor state saves as a balanced 100%", () => {
    const rows = [
      { artistId: null, name: "A", realName: "", email: "", percent: "50" },
      { artistId: null, name: "B", realName: "", email: "", percent: "50" },
    ];
    const summary = summarizeSplits(rowsToSplits(rows));
    expect(summary.total).toBe(100);
    expect(summary.balanced).toBe(true);
    expect(splitsProblem(summary.splits)).toBeNull();
  });
});
