// Advisory lyrics coverage for a release's tracks. Deliberately NOT part of the
// SEO score — instrumentals/dubs legitimately have no lyrics (see the design
// spec); scoring them down would be wrong. Pure — safe on server or client.
export function lyricsCoverage(
  tracks: Array<{ lyrics?: string | null }>
): { withLyrics: number; total: number } {
  const withLyrics = tracks.filter((t) => Boolean((t.lyrics ?? "").trim())).length;
  return { withLyrics, total: tracks.length };
}
