import { describe, expect, it } from "vitest";
import {
  resultingTracklist,
  validateResultingTracklist,
  type StoredTrack,
  type SubmittedTrack,
} from "./release-tracks";

const stored = (...tracks: [string, string | null][]): StoredTrack[] =>
  tracks.map(([id, audioFile]) => ({ id, audioFile }));

const LIVE = { nextStatus: "RELEASED" as const, nextIsLive: true };
const SCHEDULED_LIVE = { nextStatus: "SCHEDULED" as const, nextIsLive: true };
const DRAFT = { nextStatus: "DRAFT" as const, nextIsLive: false };
const COMING_SOON = { nextStatus: "SCHEDULED" as const, nextIsLive: false };

const check = (
  s: StoredTrack[],
  submitted: SubmittedTrack[] | undefined,
  ctx: { nextStatus: "DRAFT" | "SCHEDULED" | "RELEASED"; nextIsLive: boolean }
) =>
  validateResultingTracklist({
    stored: s,
    resulting: resultingTracklist(s, submitted),
    ...ctx,
  });

describe("resultingTracklist", () => {
  it("leaves the stored list alone when `tracks` is omitted", () => {
    const s = stored(["a", "a.mp3"], ["b", "b.mp3"]);
    expect(resultingTracklist(s, undefined)).toEqual([
      { id: "a", audioFile: "a.mp3", isNew: false },
      { id: "b", audioFile: "b.mp3", isNew: false },
    ]);
  });

  it("is empty for `tracks: []`", () => {
    expect(resultingTracklist(stored(["a", "a.mp3"]), [])).toEqual([]);
  });

  it("keeps a kept track's stored audio when the edit omits it", () => {
    // Mirrors the write path's `t.audioFile || prev.audioFile` — a save that
    // doesn't re-send the audio must not blank a released track.
    const s = stored(["a", "a.mp3"]);
    expect(resultingTracklist(s, [{ id: "a", audioFile: null }])).toEqual([
      { id: "a", audioFile: "a.mp3", isNew: false },
    ]);
    expect(resultingTracklist(s, [{ id: "a", audioFile: "" }])).toEqual([
      { id: "a", audioFile: "a.mp3", isNew: false },
    ]);
  });

  it("takes the submitted audio when the edit does send it", () => {
    const s = stored(["a", "old.mp3"]);
    expect(resultingTracklist(s, [{ id: "a", audioFile: "new.mp3" }])[0]?.audioFile).toBe("new.mp3");
  });

  it("marks an unknown id as a new track rather than reusing stored audio", () => {
    const s = stored(["a", "a.mp3"]);
    expect(resultingTracklist(s, [{ id: "zzz", audioFile: null }])).toEqual([
      { id: "zzz", audioFile: null, isNew: true },
    ]);
  });

  it("drops tracks the edit no longer lists", () => {
    const s = stored(["a", "a.mp3"], ["b", "b.mp3"]);
    expect(resultingTracklist(s, [{ id: "a", audioFile: null }]).map((t) => t.id)).toEqual(["a"]);
  });
});

describe("validateResultingTracklist", () => {
  // The regression this whole module exists for: `{ tracks: [] }` used to be
  // validated against the STORED tracklist, so it passed on a released record
  // and then deleted every track it had just been validated on.
  it("rejects `tracks: []` on a released release", () => {
    expect(check(stored(["a", "a.mp3"], ["b", "b.mp3"]), [], LIVE)).toMatch(/live release/i);
  });

  it("rejects `tracks: []` on a live Coming-Soon release whose date has passed", () => {
    expect(check(stored(["a", "a.mp3"]), [], SCHEDULED_LIVE)).toMatch(/live release/i);
  });

  it("allows `tracks: []` on a draft", () => {
    expect(check(stored(["a", "a.mp3"]), [], DRAFT)).toBeNull();
  });

  it("allows `tracks: []` on a future-dated Coming-Soon release", () => {
    expect(check(stored(["a", null]), [], COMING_SOON)).toBeNull();
  });

  it("does not block edits to a release that is already trackless", () => {
    // Rule 1 only fires when the edit REMOVES tracks; a live release that is
    // already empty must still be editable, or it's stranded.
    expect(check([], undefined, LIVE)).toMatch(/at least one track/i);
    expect(check([], [], SCHEDULED_LIVE)).toBeNull();
  });

  it("rejects publishing with a track that has no audio anywhere", () => {
    expect(
      check(stored(["a", "a.mp3"]), [{ id: "a", audioFile: null }, { audioFile: null }], LIVE)
    ).toMatch(/needs audio/i);
  });

  it("accepts publishing when an unchanged track keeps its stored audio", () => {
    // The editor sends the tracklist without re-uploading audio; this must not
    // read as "track has no audio".
    expect(check(stored(["a", "a.mp3"], ["b", "b.mp3"]), [
      { id: "a", audioFile: null },
      { id: "b", audioFile: "" },
    ], LIVE)).toBeNull();
  });

  it("accepts a status-only publish of a complete stored tracklist", () => {
    expect(check(stored(["a", "a.mp3"]), undefined, LIVE)).toBeNull();
  });

  it("rejects a status-only publish when a stored track has no audio", () => {
    expect(check(stored(["a", "a.mp3"], ["b", null]), undefined, LIVE)).toMatch(/needs audio/i);
  });

  it("rejects publishing a release with no tracks at all", () => {
    expect(check([], [], LIVE)).toMatch(/at least one track/i);
  });

  it("lets a draft save audio-less tracks", () => {
    expect(check([], [{ audioFile: null }, { audioFile: null }], DRAFT)).toBeNull();
  });

  it("lets a Coming-Soon release save audio-less tracks", () => {
    expect(check([], [{ audioFile: null }], COMING_SOON)).toBeNull();
  });

  it("allows replacing a live release's tracklist wholesale, as long as it stays playable", () => {
    expect(
      check(stored(["a", "a.mp3"]), [{ audioFile: "new1.mp3" }, { audioFile: "new2.mp3" }], LIVE)
    ).toBeNull();
  });

  it("rejects replacing a live tracklist with audio-less new tracks", () => {
    expect(check(stored(["a", "a.mp3"]), [{ audioFile: null }], LIVE)).toMatch(/needs audio/i);
  });
});
