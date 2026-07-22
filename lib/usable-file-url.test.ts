import { describe, expect, it } from "vitest";
import { isUsableFileUrl } from "./asset";

// This guard is now load-bearing in the release write path, the publish gate and
// four render sites. The bug it exists for: a stored value of the literal string
// "null" is TRUTHY, so `src={cover || fallback}` passes it straight to the
// browser, which resolves it RELATIVE to the current page —
//   /admin/releases/<id>/edit  +  "null"  ->  /admin/releases/<id>/null   (404)
//   /admin/releases            +  "null"  ->  /admin/null                 (404)

describe("isUsableFileUrl", () => {
  it("rejects the stringified nullish values that caused the 404s", () => {
    expect(isUsableFileUrl("null")).toBe(false);
    expect(isUsableFileUrl("undefined")).toBe(false);
  });

  it("rejects genuinely empty values", () => {
    expect(isUsableFileUrl("")).toBe(false);
    expect(isUsableFileUrl("   ")).toBe(false);
    expect(isUsableFileUrl(null)).toBe(false);
    expect(isUsableFileUrl(undefined)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isUsableFileUrl(0)).toBe(false);
    expect(isUsableFileUrl({})).toBe(false);
    expect(isUsableFileUrl(["/a.jpg"])).toBe(false);
  });

  it("rejects any bare relative value — the thing that resolves against the page", () => {
    expect(isUsableFileUrl("cover.jpg")).toBe(false);
    expect(isUsableFileUrl("images/cover.jpg")).toBe(false);
  });

  it("accepts absolute URLs", () => {
    expect(isUsableFileUrl("https://osrecord.s3.us-east-1.amazonaws.com/releases/images/a.jpg")).toBe(true);
    expect(isUsableFileUrl("http://example.com/a.jpg")).toBe(true);
  });

  it("accepts root-relative paths, which resolve the same from any page", () => {
    expect(isUsableFileUrl("/new-music-img1.svg")).toBe(true);
    expect(isUsableFileUrl("/placeholder.svg")).toBe(true);
  });

  it("accepts a real URL that merely contains the word null", () => {
    // Don't over-match: the check is on the whole value, not a substring.
    expect(isUsableFileUrl("https://cdn.example.com/null-and-void.jpg")).toBe(true);
  });
});
