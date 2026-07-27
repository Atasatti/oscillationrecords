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

  it("rewrites audioFile to the gated playback route, never the raw bucket URL", () => {
    // tracks/audio/ is a private prefix (2026-07-24 incident) — a public payload
    // carrying the raw URL would hand players a dead 403 link, and before the
    // lockdown it was the leak itself.
    expect(serializeTrackForPublic(track).audioFile).toBe("/api/tracks/t1/audio");
  });

  it("leaves a track without audio unplayable rather than minting a dead href", () => {
    const silent = { ...track, audioFile: null } as typeof track;
    expect(serializeTrackForPublic(silent).audioFile).toBeNull();
  });
});
