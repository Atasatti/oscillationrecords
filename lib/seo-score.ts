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

/**
 * One scored signal's contribution, for the per-section breakdown shown live in
 * the artist editor. `earned`/`max` are points; `status` is the traffic-light.
 */
export interface ScoreComponent {
  key: string;
  label: string;
  earned: number;
  max: number;
  status: "full" | "partial" | "none";
}

const statusOf = (earned: number, max: number): ScoreComponent["status"] =>
  earned >= max ? "full" : earned > 0 ? "partial" : "none";

export interface ArtistSeoResult {
  /** 0–100, rounded. */
  score: number;
  grade: ArtistSeoGrade;
  /** Outstanding gaps, highest-impact first; empty when nothing is missing. */
  missing: string[];
  /** Per-signal point breakdown, in display order (for the editor's panel). */
  components: ScoreComponent[];
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
  const components: ScoreComponent[] = [];
  const missing: Array<{ label: string; weight: number }> = [];

  // sameAs richness — graded by how many profiles are linked.
  const linkPoints =
    s.linkCount >= 5 ? WEIGHTS.links
    : s.linkCount >= 3 ? Math.round(WEIGHTS.links * 0.8)
    : s.linkCount >= 1 ? Math.round(WEIGHTS.links * 0.5)
    : 0;
  components.push({ key: "links", label: "Streaming & social links", earned: linkPoints, max: WEIGHTS.links, status: statusOf(linkPoints, WEIGHTS.links) });
  if (s.linkCount === 0) missing.push({ label: "streaming links", weight: WEIGHTS.links });
  else if (s.linkCount < 5) missing.push({ label: "more links", weight: WEIGHTS.links - linkPoints });

  // Biography — full credit once long enough to make a real meta description.
  let bioPoints = 0;
  if (s.bioLength >= BIO_FULL) {
    bioPoints = WEIGHTS.bio;
  } else if (s.bioLength >= BIO_MIN) {
    bioPoints = Math.round(WEIGHTS.bio * 0.6);
    missing.push({ label: "fuller bio", weight: Math.round(WEIGHTS.bio * 0.4) });
  } else {
    missing.push({ label: "bio", weight: WEIGHTS.bio });
  }
  components.push({ key: "bio", label: "Biography", earned: bioPoints, max: WEIGHTS.bio, status: statusOf(bioPoints, WEIGHTS.bio) });

  const photoPoints = s.hasPhoto ? WEIGHTS.photo : 0;
  components.push({ key: "photo", label: "Profile photo", earned: photoPoints, max: WEIGHTS.photo, status: statusOf(photoPoints, WEIGHTS.photo) });
  if (!s.hasPhoto) missing.push({ label: "photo", weight: WEIGHTS.photo });

  const mbPoints = s.hasMusicBrainz ? WEIGHTS.musicBrainz : 0;
  components.push({ key: "musicBrainz", label: "MusicBrainz ID", earned: mbPoints, max: WEIGHTS.musicBrainz, status: statusOf(mbPoints, WEIGHTS.musicBrainz) });
  if (!s.hasMusicBrainz) missing.push({ label: "MusicBrainz ID", weight: WEIGHTS.musicBrainz });

  const relPoints = s.releaseCount > 0 ? WEIGHTS.releases : 0;
  components.push({ key: "releases", label: "A release", earned: relPoints, max: WEIGHTS.releases, status: statusOf(relPoints, WEIGHTS.releases) });
  if (s.releaseCount === 0) missing.push({ label: "a release", weight: WEIGHTS.releases });

  const genrePoints = s.genreCount > 0 ? WEIGHTS.genres : 0;
  components.push({ key: "genres", label: "Genres", earned: genrePoints, max: WEIGHTS.genres, status: statusOf(genrePoints, WEIGHTS.genres) });
  if (s.genreCount === 0) missing.push({ label: "genres", weight: WEIGHTS.genres });

  const isniPoints = s.hasIsni ? WEIGHTS.isni : 0;
  components.push({ key: "isni", label: "ISNI", earned: isniPoints, max: WEIGHTS.isni, status: statusOf(isniPoints, WEIGHTS.isni) });
  if (!s.hasIsni) missing.push({ label: "ISNI", weight: WEIGHTS.isni });

  const score = components.reduce((sum, c) => sum + c.earned, 0);
  missing.sort((a, b) => b.weight - a.weight);

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ArtistSeoGrade =
    rounded >= GRADE_STRONG ? "strong" : rounded >= GRADE_GOOD ? "good" : "weak";

  return { score: rounded, grade, missing: missing.map((m) => m.label), components };
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
  /** Per-signal point breakdown, in display order (for the editor's panel). */
  components: ScoreComponent[];
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
  const components: ScoreComponent[] = [];
  const missing: Array<{ label: string; weight: number }> = [];

  // sameAs richness — graded by how many streaming profiles are linked (6 max).
  const linkPoints =
    s.linkCount >= 4 ? RELEASE_WEIGHTS.links
    : s.linkCount >= 2 ? Math.round(RELEASE_WEIGHTS.links * 0.8)
    : s.linkCount >= 1 ? Math.round(RELEASE_WEIGHTS.links * 0.5)
    : 0;
  components.push({ key: "links", label: "Streaming links", earned: linkPoints, max: RELEASE_WEIGHTS.links, status: statusOf(linkPoints, RELEASE_WEIGHTS.links) });
  if (s.linkCount === 0) missing.push({ label: "streaming links", weight: RELEASE_WEIGHTS.links });
  else if (s.linkCount < 4) missing.push({ label: "more links", weight: RELEASE_WEIGHTS.links - linkPoints });

  // Description — full credit once long enough to make a real meta description.
  let descPoints = 0;
  if (s.descLength >= BIO_FULL) {
    descPoints = RELEASE_WEIGHTS.description;
  } else if (s.descLength >= BIO_MIN) {
    descPoints = Math.round(RELEASE_WEIGHTS.description * 0.6);
    missing.push({ label: "fuller description", weight: Math.round(RELEASE_WEIGHTS.description * 0.4) });
  } else {
    missing.push({ label: "description", weight: RELEASE_WEIGHTS.description });
  }
  components.push({ key: "description", label: "Description", earned: descPoints, max: RELEASE_WEIGHTS.description, status: statusOf(descPoints, RELEASE_WEIGHTS.description) });

  const coverPoints = s.hasCover ? RELEASE_WEIGHTS.cover : 0;
  components.push({ key: "cover", label: "Cover image", earned: coverPoints, max: RELEASE_WEIGHTS.cover, status: statusOf(coverPoints, RELEASE_WEIGHTS.cover) });
  if (!s.hasCover) missing.push({ label: "cover image", weight: RELEASE_WEIGHTS.cover });

  const trackPoints = s.trackCount > 0 ? RELEASE_WEIGHTS.tracks : 0;
  components.push({ key: "tracks", label: "Tracks", earned: trackPoints, max: RELEASE_WEIGHTS.tracks, status: statusOf(trackPoints, RELEASE_WEIGHTS.tracks) });
  if (s.trackCount === 0) missing.push({ label: "tracks", weight: RELEASE_WEIGHTS.tracks });

  const genrePoints = s.genreCount > 0 ? RELEASE_WEIGHTS.genres : 0;
  components.push({ key: "genres", label: "Genres", earned: genrePoints, max: RELEASE_WEIGHTS.genres, status: statusOf(genrePoints, RELEASE_WEIGHTS.genres) });
  if (s.genreCount === 0) missing.push({ label: "genres", weight: RELEASE_WEIGHTS.genres });

  const datePoints = s.hasReleaseDate ? RELEASE_WEIGHTS.releaseDate : 0;
  components.push({ key: "releaseDate", label: "Release date", earned: datePoints, max: RELEASE_WEIGHTS.releaseDate, status: statusOf(datePoints, RELEASE_WEIGHTS.releaseDate) });
  if (!s.hasReleaseDate) missing.push({ label: "release date", weight: RELEASE_WEIGHTS.releaseDate });

  const artistPoints = s.hasPrimaryArtist ? RELEASE_WEIGHTS.primaryArtist : 0;
  components.push({ key: "primaryArtist", label: "Primary artist", earned: artistPoints, max: RELEASE_WEIGHTS.primaryArtist, status: statusOf(artistPoints, RELEASE_WEIGHTS.primaryArtist) });
  if (!s.hasPrimaryArtist) missing.push({ label: "primary artist", weight: RELEASE_WEIGHTS.primaryArtist });

  const score = components.reduce((sum, c) => sum + c.earned, 0);
  missing.sort((a, b) => b.weight - a.weight);

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ReleaseSeoGrade =
    rounded >= GRADE_STRONG ? "strong" : rounded >= GRADE_GOOD ? "good" : "weak";

  return { score: rounded, grade, missing: missing.map((m) => m.label), components };
}

// ---------------------------------------------------------------------------
// Per-artist Google Knowledge Panel readiness (GKP) score.
//
// Where the SEO score grades how *discoverable* a page is, the GKP score grades
// how ready an artist is to earn a Google Knowledge Panel — the info box about
// an entity shown beside search results. That's an *entity-identity* question,
// not a page-content one: Google builds panels from its Knowledge Graph, which
// it reconciles from the authoritative identifiers an artist carries —
//   - a Wikipedia article (the single strongest panel trigger),
//   - a Wikidata item (the strongest *controllable* Knowledge-Graph anchor),
//   - a MusicBrainz entry (Google ingests it directly for music entities),
//   - an ISNI (authoritative name identifier),
//   - a consistent web of streaming/social `sameAs` links (cross-confirmation),
// plus evidence it's a real music entity (at least one release) and a short
// description (bio). Weighted heavily toward those identity anchors, so the
// score answers: "how confidently can Google identify this artist as a distinct
// real-world entity?". Higher = more likely to qualify for a panel.
// ---------------------------------------------------------------------------

export interface ArtistGkpSignals {
  /** A Wikipedia article — the single strongest Knowledge-Panel trigger. */
  hasWikipedia: boolean;
  hasWikidata: boolean;
  hasMusicBrainz: boolean;
  hasIsni: boolean;
  /** Count of distinct streaming/social profile URLs set (feeds `sameAs`). */
  linkCount: number;
  /** Number of public releases crediting this artist (proves a music entity). */
  releaseCount: number;
  /** Length of the trimmed biography (the entity description). */
  bioLength: number;
}

export type ArtistGkpGrade = ArtistSeoGrade;

export interface ArtistGkpResult {
  score: number;
  grade: ArtistGkpGrade;
  missing: string[];
  /** Per-signal point breakdown, in display order (for the editor's panel). */
  components: ScoreComponent[];
}

// Component weights — sum to 100. Front-loaded onto the entity anchors that
// actually drive Knowledge-Graph reconciliation. A Wikipedia article and a
// Wikidata item are the two strongest triggers, so they lead.
const GKP_WEIGHTS = {
  wikipedia: 22,
  wikidata: 22,
  musicBrainz: 16,
  links: 14,
  isni: 10,
  release: 8,
  bio: 8,
} as const;

/** Score one artist's Knowledge Panel readiness. Pure — safe on server/client. */
export function computeArtistGkp(s: ArtistGkpSignals): ArtistGkpResult {
  const components: ScoreComponent[] = [];
  const missing: Array<{ label: string; weight: number }> = [];

  const wikipediaPoints = s.hasWikipedia ? GKP_WEIGHTS.wikipedia : 0;
  components.push({ key: "wikipedia", label: "Wikipedia article", earned: wikipediaPoints, max: GKP_WEIGHTS.wikipedia, status: statusOf(wikipediaPoints, GKP_WEIGHTS.wikipedia) });
  if (!s.hasWikipedia) missing.push({ label: "Wikipedia article", weight: GKP_WEIGHTS.wikipedia });

  const wikiPoints = s.hasWikidata ? GKP_WEIGHTS.wikidata : 0;
  components.push({ key: "wikidata", label: "Wikidata item", earned: wikiPoints, max: GKP_WEIGHTS.wikidata, status: statusOf(wikiPoints, GKP_WEIGHTS.wikidata) });
  if (!s.hasWikidata) missing.push({ label: "Wikidata item", weight: GKP_WEIGHTS.wikidata });

  const mbPoints = s.hasMusicBrainz ? GKP_WEIGHTS.musicBrainz : 0;
  components.push({ key: "musicBrainz", label: "MusicBrainz ID", earned: mbPoints, max: GKP_WEIGHTS.musicBrainz, status: statusOf(mbPoints, GKP_WEIGHTS.musicBrainz) });
  if (!s.hasMusicBrainz) missing.push({ label: "MusicBrainz ID", weight: GKP_WEIGHTS.musicBrainz });

  // sameAs richness — graded by how many profiles cross-confirm the identity.
  const linkPoints =
    s.linkCount >= 5 ? GKP_WEIGHTS.links
    : s.linkCount >= 3 ? Math.round(GKP_WEIGHTS.links * 0.8)
    : s.linkCount >= 1 ? Math.round(GKP_WEIGHTS.links * 0.5)
    : 0;
  components.push({ key: "links", label: "Streaming & social links", earned: linkPoints, max: GKP_WEIGHTS.links, status: statusOf(linkPoints, GKP_WEIGHTS.links) });
  if (s.linkCount === 0) missing.push({ label: "streaming links", weight: GKP_WEIGHTS.links });
  else if (s.linkCount < 5) missing.push({ label: "more links", weight: GKP_WEIGHTS.links - linkPoints });

  const isniPoints = s.hasIsni ? GKP_WEIGHTS.isni : 0;
  components.push({ key: "isni", label: "ISNI", earned: isniPoints, max: GKP_WEIGHTS.isni, status: statusOf(isniPoints, GKP_WEIGHTS.isni) });
  if (!s.hasIsni) missing.push({ label: "ISNI", weight: GKP_WEIGHTS.isni });

  const relPoints = s.releaseCount > 0 ? GKP_WEIGHTS.release : 0;
  components.push({ key: "release", label: "A release", earned: relPoints, max: GKP_WEIGHTS.release, status: statusOf(relPoints, GKP_WEIGHTS.release) });
  if (s.releaseCount === 0) missing.push({ label: "a release", weight: GKP_WEIGHTS.release });

  // Bio — full credit once long enough to describe the entity.
  let bioPoints = 0;
  if (s.bioLength >= BIO_FULL) {
    bioPoints = GKP_WEIGHTS.bio;
  } else if (s.bioLength >= BIO_MIN) {
    bioPoints = Math.round(GKP_WEIGHTS.bio * 0.6);
    missing.push({ label: "fuller bio", weight: Math.round(GKP_WEIGHTS.bio * 0.4) });
  } else {
    missing.push({ label: "bio", weight: GKP_WEIGHTS.bio });
  }
  components.push({ key: "bio", label: "Biography", earned: bioPoints, max: GKP_WEIGHTS.bio, status: statusOf(bioPoints, GKP_WEIGHTS.bio) });

  const score = components.reduce((sum, c) => sum + c.earned, 0);
  missing.sort((a, b) => b.weight - a.weight);

  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const grade: ArtistGkpGrade =
    rounded >= GRADE_STRONG ? "strong" : rounded >= GRADE_GOOD ? "good" : "weak";

  return { score: rounded, grade, missing: missing.map((m) => m.label), components };
}

// ---------------------------------------------------------------------------
// Name-ambiguity heuristic (advisory — NOT part of the numeric score).
//
// A generic, common-word name (e.g. "Portrait", "Slay") is hard for Google to
// reconcile to one entity, which suppresses Knowledge Panels however complete
// the data is. That's a property of the NAME — you can't "fill it in" — so it's
// surfaced as an advisory difficulty flag in the editor, not folded into the
// score (which would make a perfect-data artist unfairly un-maxable). Heuristic
// and deliberately conservative: it flags plain single-word names and common
// dictionary words (e.g. "Portrait"); coined spellings (digits, CamelCase) and
// multi-word names are treated as distinctive, and a leading "DJ"/"MC" is ignored.
// ---------------------------------------------------------------------------

export type NameAmbiguityLevel = "low" | "medium" | "high";

export interface NameAmbiguityResult {
  level: NameAmbiguityLevel;
  note: string;
}

// Leading stage prefixes that add no disambiguation ("DJ Rasp" → judge "Rasp").
const STAGE_PREFIXES = new Set(["dj", "mc"]);

// Non-exhaustive set of common English words / everyday nouns that, used alone as
// a stage name, conflate badly with the ordinary word and other acts — so they're
// flagged high regardless of length. Extend as collisions come up; it only needs
// the common ones, not a full dictionary.
const COMMON_NAME_WORDS = new Set([
  "portrait", "phoenix", "echo", "halo", "satin", "velvet", "shadow", "shadows",
  "midnight", "ocean", "river", "storm", "ghost", "angel", "angels", "saint",
  "royal", "crystal", "diamond", "gold", "silver", "neon", "electric", "cosmic",
  "lunar", "solar", "nova", "aurora", "ember", "frost", "prism", "pulse", "rogue",
  "sage", "siren", "spark", "static", "vapor", "wave", "waves", "zenith", "apollo",
  "atlas", "bloom", "chase", "dawn", "drift", "fable", "flux", "glory", "grace",
  "haven", "horizon", "ivory", "legend", "mirage", "muse", "myth", "oracle",
  "paradise", "raven", "rebel", "rhythm", "ritual", "savage", "serene", "solace",
  "sublime", "tide", "trance", "twilight", "utopia", "vivid", "void", "wander",
  "wild", "zephyr",
]);

export function assessNameAmbiguity(name: string): NameAmbiguityResult {
  const n = (name || "").trim();
  if (!n) return { level: "low", note: "" };

  // Coined/stylised forms are inherently distinctive: a digit, a symbol, or an
  // internal lower→upper transition (CamelCase like "HeyJustMalik", "MiXX").
  const distinctive =
    /\d/.test(n) || /[^\p{L}\s'.&-]/u.test(n) || /\p{Ll}\p{Lu}/u.test(n);
  if (distinctive) {
    return { level: "low", note: "Distinctive spelling — easy for Google to tell apart." };
  }

  // Ignore a leading non-identifying prefix before judging distinctiveness.
  let tokens = n.split(/\s+/);
  if (tokens.length > 1 && STAGE_PREFIXES.has(tokens[0].toLowerCase().replace(/[^a-z]/g, ""))) {
    tokens = tokens.slice(1);
  }
  if (tokens.length >= 2) {
    return { level: "low", note: "Multi-word name — reasonably distinctive." };
  }

  // Single plain word.
  const letters = tokens[0].replace(/[^\p{L}]/gu, "");
  const isAllCaps = letters.length >= 2 && letters === letters.toUpperCase();

  // A real common word (e.g. "Portrait", "Phoenix") is the hardest to reconcile,
  // however long — flag highest.
  if (COMMON_NAME_WORDS.has(letters.toLowerCase())) {
    return {
      level: "high",
      note: "Common dictionary word as a name — Google will conflate this with the everyday word and other acts using it. The identity anchors above matter most here.",
    };
  }
  if (isAllCaps) {
    return {
      level: "medium",
      note: "Stylised single word — lean on strong identity anchors (Wikipedia, Wikidata, ISNI) so Google reconciles the right entity.",
    };
  }
  if (letters.length <= 6) {
    return {
      level: "high",
      note: "Short, common-looking single-word name — Google will struggle to tell this artist apart from others. The identity anchors above matter even more here.",
    };
  }
  return {
    level: "medium",
    note: "Single-word name — strong identity anchors help Google pick the right entity.",
  };
}
