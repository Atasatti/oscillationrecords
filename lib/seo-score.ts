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

// ---------------------------------------------------------------------------
// Per-release SEO score.
//
// Mirrors the artist score, but graded against what the public *release* page
// emits: a schema.org MusicAlbum + OpenGraph card (see buildReleaseJsonLd in
// lib/seo.ts). The fields that move a release's discoverability are the
// streaming `sameAs` links, a real description (meta description / OG body), the
// cover image (the OG image), genres, a tracklist (numTracks/track[]), a
// release date (datePublished) and a credited primary artist (byArtist).
// ---------------------------------------------------------------------------

export interface ReleaseSeoSignals {
  hasCover: boolean;
  /** Length of the trimmed description (drives meta description quality). */
  descLength: number;
  /** Distinct genres set on the release (primary + secondary). */
  genreCount: number;
  /** Count of distinct streaming profile URLs set (feeds `sameAs`). */
  linkCount: number;
  /** Number of tracks (feeds numTracks + the track[] list). */
  trackCount: number;
  hasReleaseDate: boolean;
  hasPrimaryArtist: boolean;
}

export type ReleaseSeoGrade = ArtistSeoGrade;

export interface ReleaseSeoResult {
  score: number;
  grade: ReleaseSeoGrade;
  missing: string[];
}

// Component weights — sum to 100.
const RELEASE_WEIGHTS = {
  links: 22,
  description: 20,
  cover: 16,
  tracks: 14,
  genres: 12,
  releaseDate: 10,
  primaryArtist: 6,
} as const;

/** Score one release's SEO from its signals. Pure — safe on server or client. */
export function computeReleaseSeo(s: ReleaseSeoSignals): ReleaseSeoResult {
  let score = 0;
  const missing: Array<{ label: string; weight: number }> = [];

  // sameAs richness — graded by how many streaming profiles are linked (6 max).
  const linkPoints =
    s.linkCount >= 4 ? RELEASE_WEIGHTS.links
    : s.linkCount >= 2 ? Math.round(RELEASE_WEIGHTS.links * 0.8)
    : s.linkCount >= 1 ? Math.round(RELEASE_WEIGHTS.links * 0.5)
    : 0;
  score += linkPoints;
  if (s.linkCount === 0) missing.push({ label: "streaming links", weight: RELEASE_WEIGHTS.links });
  else if (s.linkCount < 4) missing.push({ label: "more links", weight: RELEASE_WEIGHTS.links - linkPoints });

  // Description — full credit once long enough to make a real meta description.
  if (s.descLength >= BIO_FULL) {
    score += RELEASE_WEIGHTS.description;
  } else if (s.descLength >= BIO_MIN) {
    score += Math.round(RELEASE_WEIGHTS.description * 0.6);
    missing.push({ label: "fuller description", weight: Math.round(RELEASE_WEIGHTS.description * 0.4) });
  } else {
    missing.push({ label: "description", weight: RELEASE_WEIGHTS.description });
  }

  if (s.hasCover) score += RELEASE_WEIGHTS.cover;
  else missing.push({ label: "cover image", weight: RELEASE_WEIGHTS.cover });

  if (s.trackCount > 0) score += RELEASE_WEIGHTS.tracks;
  else missing.push({ label: "tracks", weight: RELEASE_WEIGHTS.tracks });

  if (s.genreCount > 0) score += RELEASE_WEIGHTS.genres;
  else missing.push({ label: "genres", weight: RELEASE_WEIGHTS.genres });

  if (s.hasReleaseDate) score += RELEASE_WEIGHTS.releaseDate;
  else missing.push({ label: "release date", weight: RELEASE_WEIGHTS.releaseDate });

  if (s.hasPrimaryArtist) score += RELEASE_WEIGHTS.primaryArtist;
  else missing.push({ label: "primary artist", weight: RELEASE_WEIGHTS.primaryArtist });

  missing.sort((a, b) => b.weight - a.weight);

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ReleaseSeoGrade =
    rounded >= GRADE_STRONG ? "strong" : rounded >= GRADE_GOOD ? "good" : "weak";

  return { score: rounded, grade, missing: missing.map((m) => m.label) };
}
