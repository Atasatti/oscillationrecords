// Pure helpers for lyrics ingestion — shared by the ingest CLI and its tests.
// Kept in plain .mjs so the CLI can run under Node with no build step.

/** Normalize a lyrics string for storage: trim; empty → null. */
export function normalizeLyrics(value) {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

/**
 * Decide whether to write `incoming` lyrics onto a track whose current stored
 * value is `current`. Fill ONLY when the track has no lyrics yet and incoming is
 * non-empty. Never overwrite existing lyrics.
 */
export function shouldFillLyrics(current, incoming) {
  const cur = String(current ?? "").trim();
  const inc = String(incoming ?? "").trim();
  return cur.length === 0 && inc.length > 0;
}
