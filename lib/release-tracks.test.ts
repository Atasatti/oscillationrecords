import { describe, expect, it } from "vitest";
import {
  hasPlayableTrack,
  resultingTracklist,
  tracklistAfterDelete,
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

// The standalone DELETE /api/tracks/[id] (the legacy release detail page's
// per-track delete) reuses these same rules via tracklistAfterDelete +
// validateResultingTracklist, so a single delete can no longer empty a live
// release the way the tracklist editor already can't.
// The readiness gate that keeps a scheduled release from going public without
// audio when its date passes: a release is publicly visible only if it has at
// least one playable track. (No publish job exists — visibility is computed at
// query time — so this IS the final pre-publication readiness check.)
describe("hasPlayableTrack", () => {
  it("is true when at least one track has a non-empty audio file", () => {
    expect(hasPlayableTrack([{ audioFile: null }, { audioFile: "a.mp3" }])).toBe(true);
  });

  it("is false for a trackless release", () => {
    expect(hasPlayableTrack([])).toBe(false);
  });

  it("is false when every track lacks audio (scheduled date passed, no upload)", () => {
    expect(hasPlayableTrack([{ audioFile: null }, { audioFile: null }])).toBe(false);
  });

  it("treats an empty / whitespace audio string as not playable", () => {
    // The editor can persist "" — a failed/cleared upload must not read as ready.
    expect(hasPlayableTrack([{ audioFile: "" }, { audioFile: "   " }])).toBe(false);
  });
});

describe("tracklistAfterDelete", () => {
  it("returns the stored list minus the deleted track (as kept, non-new rows)", () => {
    const s = stored(["a", "a.mp3"], ["b", "b.mp3"]);
    expect(tracklistAfterDelete(s, "a")).toEqual([{ id: "b", audioFile: "b.mp3", isNew: false }]);
  });

  it("is a no-op for an id that isn't in the list", () => {
    const s = stored(["a", "a.mp3"]);
    expect(tracklistAfterDelete(s, "zzz").map((t) => t.id)).toEqual(["a"]);
  });

  it("empties a single-track list", () => {
    expect(tracklistAfterDelete(stored(["a", "a.mp3"]), "a")).toEqual([]);
  });
});

describe("standalone single-track delete (via tracklistAfterDelete)", () => {
  const deleteCheck = (
    s: StoredTrack[],
    id: string,
    ctx: { nextStatus: "DRAFT" | "SCHEDULED" | "RELEASED"; nextIsLive: boolean }
  ) =>
    validateResultingTracklist({ stored: s, resulting: tracklistAfterDelete(s, id), ...ctx });

  it("BLOCKS deleting the last track of a RELEASED release", () => {
    expect(deleteCheck(stored(["a", "a.mp3"]), "a", LIVE)).toMatch(/live release/i);
  });

  it("BLOCKS deleting the last track of a live (past-dated) Coming-Soon release", () => {
    expect(deleteCheck(stored(["a", "a.mp3"]), "a", SCHEDULED_LIVE)).toMatch(/live release/i);
  });

  it("ALLOWS deleting one track from a multi-track live release", () => {
    expect(deleteCheck(stored(["a", "a.mp3"], ["b", "b.mp3"]), "a", LIVE)).toBeNull();
  });

  it("ALLOWS deleting the last track of a DRAFT release", () => {
    expect(deleteCheck(stored(["a", "a.mp3"]), "a", DRAFT)).toBeNull();
  });

  it("ALLOWS deleting the last track of a future-dated Coming-Soon release", () => {
    expect(deleteCheck(stored(["a", null]), "a", COMING_SOON)).toBeNull();
  });

  it("models the concurrent last-two-delete race: each delete leaves one track, so the SECOND (re-read) is blocked", () => {
    // Two tracks on a live release; two concurrent deletes. Whichever commits
    // first leaves [other]; the loser retries and re-reads a one-track list, so
    // deleting its target now empties the release and is rejected — the DB-level
    // guarantee the route gets from re-checking inside the transaction.
    const twoTracks = stored(["a", "a.mp3"], ["b", "b.mp3"]);
    expect(deleteCheck(twoTracks, "a", LIVE)).toBeNull(); // first delete: ok
    const afterFirst = stored(["b", "b.mp3"]); // list the retried tx re-reads
    expect(deleteCheck(afterFirst, "b", LIVE)).toMatch(/live release/i); // second: blocked
  });
});
