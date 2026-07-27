// Resulting-state calculation for a release tracklist edit.
//
// A PATCH to /api/releases/[releaseId] can add, update, remove or clear tracks.
// The invariants that protect a LIVE release have to be checked against the
// tracklist the edit will LEAVE BEHIND, never against the one currently stored —
// checking the stored list is how `{ tracks: [] }` used to pass validation on a
// released record and then delete every track it had just been validated on.
//
// Pure (no Prisma, no I/O) so the rules are unit-testable without a database.

export type StoredTrack = {
  id: string;
  audioFile: string | null;
};

/** The shape parseTrackInput() produces, narrowed to what these rules need. */
export type SubmittedTrack = {
  id?: string;
  audioFile: string | null;
};

export type ResultingTrack = {
  /** Existing track id, or null for one being created. */
  id: string | null;
  /** The audio the track will have AFTER the write. */
  audioFile: string | null;
  isNew: boolean;
};

/**
 * The tracklist a PATCH will leave behind.
 *
 * `submitted` is undefined when the request omits `tracks` entirely (the list is
 * untouched) and an empty array when it asks to clear every track. A submitted
 * track that carries a known id but no audio keeps its stored audio — that
 * mirrors the write path's `t.audioFile || prev.audioFile`, so validation and
 * the write agree on what the track will end up with.
 */
export function resultingTracklist(
  stored: readonly StoredTrack[],
  submitted: readonly SubmittedTrack[] | undefined
): ResultingTrack[] {
  if (submitted === undefined) {
    return stored.map((t) => ({ id: t.id, audioFile: t.audioFile, isNew: false }));
  }
  const storedById = new Map(stored.map((t) => [String(t.id), t]));
  return submitted.map((t) => {
    const prev = t.id ? storedById.get(String(t.id)) : undefined;
    return prev
      ? { id: prev.id, audioFile: t.audioFile || prev.audioFile, isNew: false }
      : { id: t.id ?? null, audioFile: t.audioFile, isNew: true };
  });
}

/**
 * The tracklist a STANDALONE single-track delete (DELETE /api/tracks/[id]) would
 * leave behind: the stored list minus the one track. Feeds the same
 * {@link validateResultingTracklist} the editor's PATCH uses, so the legacy
 * detail page's delete and the main workflow enforce identical invariants —
 * neither can pull the last track out from under a live release.
 */
export function tracklistAfterDelete(
  stored: readonly StoredTrack[],
  deletedTrackId: string
): ResultingTrack[] {
  return stored
    .filter((t) => String(t.id) !== String(deletedTrackId))
    .map((t) => ({ id: t.id, audioFile: t.audioFile, isNew: false }));
}

export type TracklistCheck = {
  stored: readonly StoredTrack[];
  resulting: readonly ResultingTrack[];
  /** The status the release will have after this write. */
  nextStatus: "DRAFT" | "SCHEDULED" | "RELEASED";
  /** Whether the release will be publicly visible after this write
   *  (isReleasePublic of the resulting status + date). */
  nextIsLive: boolean;
};

/**
 * Reject an edit that would damage a live release. Returns the error message, or
 * null when the resulting state is acceptable.
 *
 * Two rules, deliberately narrow so ordinary saves are never blocked:
 *
 *  1. A live release may not be emptied. Scoped to edits that actually REMOVE
 *     tracks (stored non-empty → resulting empty), so a release that is already
 *     trackless can still be edited — those exist, and blocking every save on
 *     one would strand it.
 *  2. Publishing (RELEASED) still requires a playable tracklist: at least one
 *     track, every one with audio. Unchanged in intent from before; the
 *     difference is that it now reads the resulting list, so clearing the
 *     tracks can no longer sneak past it.
 *
 * Drafts and future-dated Coming-Soon releases are untouched by both.
 */
export function validateResultingTracklist(check: TracklistCheck): string | null {
  const { stored, resulting, nextStatus, nextIsLive } = check;

  if (nextIsLive && stored.length > 0 && resulting.length === 0) {
    return "Removing every track would leave this live release with nothing to play. Move it back to Draft first, or delete the release.";
  }

  if (nextStatus === "RELEASED") {
    if (resulting.length === 0) {
      return "A released release needs at least one track.";
    }
    if (resulting.some((t) => !t.audioFile)) {
      return "Every track needs audio before this release can go live.";
    }
  }

  return null;
}

/** Thrown inside the write transaction when the freshly-read state fails the
 *  rules above, so the whole edit rolls back and the caller answers 400. */
export class TracklistError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TracklistError";
  }
}
