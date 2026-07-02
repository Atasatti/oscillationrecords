// Release "delivery readiness" checklist — is a release complete enough to
// publish / deliver to DSPs? Distinct from the SEO score (lib/seo-score.ts),
// which grades public discoverability. This grades metadata completeness for
// distribution: artwork, tracks, identifiers (UPC/ISRC), a date, a credited
// artist, a genre and streaming links. Pure — safe on server or client.

export interface ReleaseReadinessInput {
  hasCover: boolean;
  trackCount: number;
  /** Tracks with no ISRC set (each track needs one for distribution/royalties). */
  tracksMissingIsrc: number;
  hasUpc: boolean;
  hasReleaseDate: boolean;
  hasPrimaryArtist: boolean;
  hasGenre: boolean;
  /** Count of distinct streaming links set on the release. */
  linkCount: number;
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** Extra context when not done (e.g. "2 of 5 tracks missing an ISRC"). */
  detail?: string;
}

export interface ReleaseReadinessResult {
  items: ReadinessItem[];
  doneCount: number;
  total: number;
  /** True when every check passes — the release is delivery-ready. */
  ready: boolean;
}

export function computeReleaseReadiness(s: ReleaseReadinessInput): ReleaseReadinessResult {
  const items: ReadinessItem[] = [
    { key: "cover", label: "Cover artwork", done: s.hasCover },
    { key: "tracks", label: "At least one track", done: s.trackCount > 0 },
    {
      key: "isrc",
      label: "ISRC on every track",
      done: s.trackCount > 0 && s.tracksMissingIsrc === 0,
      detail:
        s.trackCount === 0
          ? "Add tracks first"
          : s.tracksMissingIsrc > 0
            ? `${s.tracksMissingIsrc} of ${s.trackCount} track${s.trackCount === 1 ? "" : "s"} missing an ISRC`
            : undefined,
    },
    { key: "upc", label: "UPC / barcode", done: s.hasUpc },
    { key: "artist", label: "Primary artist credited", done: s.hasPrimaryArtist },
    { key: "date", label: "Release date set", done: s.hasReleaseDate },
    { key: "genre", label: "Genre set", done: s.hasGenre },
    { key: "links", label: "Streaming links", done: s.linkCount > 0 },
  ];

  const doneCount = items.filter((i) => i.done).length;
  return { items, doneCount, total: items.length, ready: doneCount === items.length };
}
