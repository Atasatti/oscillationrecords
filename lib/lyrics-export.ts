// Synthesize downloadable lyrics files from a release's tracks. Lyrics live as
// text on the Track (plain `lyrics`, LRC `syncedLyrics`), not as stored files.

export type LyricsTrack = {
  name: string;
  lyrics?: string | null;
  syncedLyrics?: string | null;
};

/** Combined plain-text of every track that has lyrics; "" if none. */
export function buildLyricsTxt(tracks: LyricsTrack[]): string {
  const parts: string[] = [];
  let n = 0;
  for (const t of tracks) {
    const lyr = (t.lyrics ?? "").trim();
    if (!lyr) continue;
    n += 1;
    parts.push(`${String(n).padStart(2, "0")}. ${t.name}\n\n${lyr}\n`);
  }
  return parts.join("\n");
}

/** One .lrc entry per track with synced timing; [] if none. */
export function buildLrcEntries(tracks: LyricsTrack[]): { name: string; data: string }[] {
  const out: { name: string; data: string }[] = [];
  let n = 0;
  for (const t of tracks) {
    const lrc = (t.syncedLyrics ?? "").trim();
    if (!lrc) continue;
    n += 1;
    const safe = t.name.replace(/[^\w.\- ]+/g, "_").trim() || "track";
    out.push({ name: `${String(n).padStart(2, "0")} ${safe}.lrc`, data: lrc });
  }
  return out;
}
