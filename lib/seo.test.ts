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
