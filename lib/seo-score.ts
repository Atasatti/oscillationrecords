// Per-artist SEO score.
//
// The public artist page already emits rich metadata + schema.org JSON-LD (see
// lib/seo.ts). How *strong* that output is for any given artist depends entirely
// on which fields the label has filled in. This module turns those fields into a
// single 0–100 score plus a weight-ordered list of what's missing, so the admin
// roster can show, per artist, exactly what's suppressing their discoverability
// and which gap to close first for the biggest gain.
//
// Weights reflect real SEO impact for a musician entity, not just "field present":
//   - streaming/social links + MusicBrainz + ISNI feed schema.org `sameAs`, which
//     is how Google reconciles the page to a real-world entity / knowledge panel —
//     the single highest-leverage signal, so it carries the most weight.
//   - photo + bio + genres drive the OpenGraph card, meta description and keywords.
//   - having at least one release strengthens the entity (album[] in the JSON-LD).

export interface ArtistSeoSignals {
  hasPhoto: boolean;
  /** Length of the trimmed biography (drives meta description quality). */
  bioLength: number;
  genreCount: number;
  /** Count of distinct streaming/social profile URLs set (feeds `sameAs`). */
  linkCount: number;
  hasMusicBrainz: boolean;
  hasIsni: boolean;
  /** Number of public releases crediting this artist. */
  releaseCount: number;
}

export type ArtistSeoGrade = "strong" | "good" | "weak";

export interface ArtistSeoResult {
  /** 0–100, rounded. */
  score: number;
  grade: ArtistSeoGrade;
  /** Outstanding gaps, highest-impact first; empty when nothing is missing. */
  missing: string[];
}

// Component weights — sum to 100.
const WEIGHTS = {
  links: 25,
  bio: 20,
  photo: 15,
  musicBrainz: 12,
  releases: 10,
  genres: 10,
  isni: 8,
} as const;

// A "good" meta description is ~150–160 chars; reward a bio that can fill it.
const BIO_FULL = 150;
const BIO_MIN = 30;

const GRADE_STRONG = 85;
const GRADE_GOOD = 60;

/** Score one artist's SEO from its signals. Pure — safe on server or client. */
export function computeArtistSeo(s: ArtistSeoSignals): ArtistSeoResult {
  let score = 0;
  const missing: Array<{ label: string; weight: number }> = [];

  // sameAs richness — graded by how many profiles are linked.
  const linkPoints =
    s.linkCount >= 5 ? WEIGHTS.links
    : s.linkCount >= 3 ? Math.round(WEIGHTS.links * 0.8)
    : s.linkCount >= 1 ? Math.round(WEIGHTS.links * 0.5)
    : 0;
  score += linkPoints;
  if (s.linkCount === 0) missing.push({ label: "streaming links", weight: WEIGHTS.links });
  else if (s.linkCount < 5) missing.push({ label: "more links", weight: WEIGHTS.links - linkPoints });

  // Biography — full credit once long enough to make a real meta description.
  if (s.bioLength >= BIO_FULL) {
    score += WEIGHTS.bio;
  } else if (s.bioLength >= BIO_MIN) {
    score += Math.round(WEIGHTS.bio * 0.6);
    missing.push({ label: "fuller bio", weight: Math.round(WEIGHTS.bio * 0.4) });
  } else {
    missing.push({ label: "bio", weight: WEIGHTS.bio });
  }

  if (s.hasPhoto) score += WEIGHTS.photo;
  else missing.push({ label: "photo", weight: WEIGHTS.photo });

  if (s.hasMusicBrainz) score += WEIGHTS.musicBrainz;
  else missing.push({ label: "MusicBrainz ID", weight: WEIGHTS.musicBrainz });

  if (s.releaseCount > 0) score += WEIGHTS.releases;
  else missing.push({ label: "a release", weight: WEIGHTS.releases });

  if (s.genreCount > 0) score += WEIGHTS.genres;
  else missing.push({ label: "genres", weight: WEIGHTS.genres });

  if (s.hasIsni) score += WEIGHTS.isni;
  else missing.push({ label: "ISNI", weight: WEIGHTS.isni });

  missing.sort((a, b) => b.weight - a.weight);

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ArtistSeoGrade =
    rounded >= GRADE_STRONG ? "strong" : rounded >= GRADE_GOOD ? "good" : "weak";

  return { score: rounded, grade, missing: missing.map((m) => m.label) };
}
