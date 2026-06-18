// Server-only MusicBrainz client for free social/streaming-link enrichment.
// MusicBrainz needs no API key, but its policy REQUIRES a descriptive
// User-Agent with real contact info and limits clients to ~1 request/second.
// We serialize calls through a module-level gate to stay under that limit.
// This is enrichment, not a source of truth — coverage for indie artists is
// sparse and name matches can be ambiguous, so callers must let the admin pick.
// Server-only by usage: imported solely by the admin MusicBrainz API route.

const MB_BASE = "https://musicbrainz.org/ws/2";
const MIN_INTERVAL_MS = 1100; // a touch over 1 req/sec to be safe

function userAgent(): string {
  // Falls back to a generic UA; set MUSICBRAINZ_USER_AGENT in .env with a real
  // contact (e.g. "OscillationRecords/1.0 ( you@example.com )") per MB policy.
  return (
    process.env.MUSICBRAINZ_USER_AGENT ||
    "OscillationRecords/1.0 ( admin@oscillationrecords.com )"
  );
}

// Serialize + space out requests: each call chains onto the previous one and
// waits until MIN_INTERVAL_MS has elapsed since the last fetch.
let gate: Promise<void> = Promise.resolve();
let lastCall = 0;

async function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  });
  // Advance the gate regardless of this call's outcome.
  gate = run.then(
    () => undefined,
    () => undefined
  );
  await run;
  return fn();
}

async function mbFetch(path: string): Promise<unknown> {
  return rateLimited(async () => {
    const res = await fetch(`${MB_BASE}${path}`, {
      headers: { "User-Agent": userAgent(), Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
    return res.json();
  });
}

export type MbArtistMatch = {
  mbid: string;
  name: string;
  disambiguation: string | null;
  country: string | null;
  score: number | null;
};

type RawSearch = {
  artists?: Array<{
    id: string;
    name: string;
    disambiguation?: string;
    country?: string;
    score?: number;
  }>;
};

/** Search MusicBrainz artists by name. */
export async function searchArtists(q: string, limit = 8): Promise<MbArtistMatch[]> {
  const query = q.trim();
  if (!query) return [];
  const data = (await mbFetch(
    `/artist?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`
  )) as RawSearch;
  return (data.artists || []).map((a) => ({
    mbid: a.id,
    name: a.name,
    disambiguation: a.disambiguation || null,
    country: a.country || null,
    score: typeof a.score === "number" ? a.score : null,
  }));
}

export type MbReleaseMatch = {
  mbid: string;
  title: string;
  artist: string | null;
  date: string | null;
  country: string | null;
  score: number | null;
};

type RawArtistCredit = Array<{ name?: string; joinphrase?: string; artist?: { name?: string } }>;

type RawReleaseSearch = {
  releases?: Array<{
    id: string;
    title: string;
    date?: string;
    country?: string;
    score?: number;
    "artist-credit"?: RawArtistCredit;
  }>;
};

/** Join an artist-credit array into a display name ("A feat. B"). */
function artistCreditName(credit?: RawArtistCredit): string | null {
  if (!credit || !credit.length) return null;
  const s = credit
    .map((c) => `${c.name || c.artist?.name || ""}${c.joinphrase || ""}`)
    .join("")
    .trim();
  return s || null;
}

/** Search MusicBrainz releases by title (optionally "title artist"). */
export async function searchReleases(q: string, limit = 8): Promise<MbReleaseMatch[]> {
  const query = q.trim();
  if (!query) return [];
  const data = (await mbFetch(
    `/release?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`
  )) as RawReleaseSearch;
  return (data.releases || []).map((r) => ({
    mbid: r.id,
    title: r.title,
    artist: artistCreditName(r["artist-credit"]),
    date: r.date || null,
    country: r.country || null,
    score: typeof r.score === "number" ? r.score : null,
  }));
}

// Our internal link field keys (must match the Artist model / ArtistEditor).
export type ArtistLinkKey =
  | "xLink"
  | "tiktokLink"
  | "spotifyLink"
  | "instagramLink"
  | "youtubeLink"
  | "facebookLink"
  | "appleMusicLink"
  | "tidalLink"
  | "amazonMusicLink"
  | "soundcloudLink";

// MusicBrainz groups many platforms under generic relationship types
// ("social network", "streaming"), so we map by URL HOST, not rel type.
function linkKeyForHost(host: string): ArtistLinkKey | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === "twitter.com" || h === "x.com" || h === "mobile.twitter.com") return "xLink";
  if (h.endsWith("instagram.com")) return "instagramLink";
  if (h.endsWith("facebook.com") || h === "fb.com") return "facebookLink";
  if (h.endsWith("tiktok.com")) return "tiktokLink";
  if (h.endsWith("spotify.com")) return "spotifyLink";
  if (h.endsWith("music.apple.com") || h.endsWith("itunes.apple.com")) return "appleMusicLink";
  if (h.endsWith("tidal.com")) return "tidalLink";
  if (h.includes("amazon.")) return "amazonMusicLink"; // music.amazon.*, amazon.*/music
  if (h.endsWith("soundcloud.com")) return "soundcloudLink";
  if (h.endsWith("youtube.com") || h === "youtu.be") return "youtubeLink";
  return null;
}

type RawTag = { name?: string; count?: number };
type RawArtistRels = {
  relations?: Array<{
    url?: { resource?: string };
    "target-type"?: string;
  }>;
  isnis?: string[];
  ipis?: string[];
  genres?: RawTag[];
  tags?: RawTag[];
};

export type MbArtistDetails = {
  links: Partial<Record<ArtistLinkKey, string>>;
  /** ISNIs MusicBrainz holds for this artist (usually 0 or 1). */
  isnis: string[];
  /** IPI name numbers MusicBrainz holds for this artist. */
  ipis: string[];
  /** Genres (curated genre list, falling back to community tags), most-used first. */
  genres: string[];
};

/** Pick the strongest genre/tag names (curated genres preferred over folk tags). */
function topGenres(data: RawArtistRels, limit = 6): string[] {
  const source = data.genres && data.genres.length ? data.genres : data.tags || [];
  return source
    .filter((g): g is RawTag & { name: string } => Boolean(g && g.name))
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, limit)
    .map((g) => g.name);
}

/**
 * Resolve an artist's URL relationships into our link fields, plus any ISNI/IPI
 * codes MusicBrainz already holds (these come back in the same lookup). Returns
 * the first URL found per platform. Throws on network/HTTP error.
 */
export async function getArtistDetails(mbid: string): Promise<MbArtistDetails> {
  const data = (await mbFetch(
    `/artist/${encodeURIComponent(mbid)}?inc=url-rels+genres+tags&fmt=json`
  )) as RawArtistRels;
  const links: Partial<Record<ArtistLinkKey, string>> = {};
  for (const rel of data.relations || []) {
    const url = rel.url?.resource;
    if (!url) continue;
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    const key = linkKeyForHost(host);
    if (key && !links[key]) links[key] = url;
  }
  return {
    links,
    isnis: Array.isArray(data.isnis) ? data.isnis : [],
    ipis: Array.isArray(data.ipis) ? data.ipis : [],
    genres: topGenres(data),
  };
}

// A release carries only streaming-platform links (no socials), matching the
// Release model's six link fields.
export type ReleaseLinkKey =
  | "spotifyLink"
  | "appleMusicLink"
  | "tidalLink"
  | "amazonMusicLink"
  | "youtubeLink"
  | "soundcloudLink";

const RELEASE_LINK_KEYS: ReleaseLinkKey[] = [
  "spotifyLink",
  "appleMusicLink",
  "tidalLink",
  "amazonMusicLink",
  "youtubeLink",
  "soundcloudLink",
];

/** Reuse the host→key map, but accept only the six release streaming platforms. */
function releaseLinkKeyForHost(host: string): ReleaseLinkKey | null {
  const key = linkKeyForHost(host);
  return key && (RELEASE_LINK_KEYS as string[]).includes(key)
    ? (key as ReleaseLinkKey)
    : null;
}

export type MbReleaseDetails = {
  links: Partial<Record<ReleaseLinkKey, string>>;
};

/**
 * Resolve a release's URL relationships into our streaming link fields. Returns
 * the first URL found per platform. Throws on network/HTTP error.
 */
export async function getReleaseDetails(mbid: string): Promise<MbReleaseDetails> {
  const data = (await mbFetch(
    `/release/${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`
  )) as RawArtistRels;
  const links: Partial<Record<ReleaseLinkKey, string>> = {};
  for (const rel of data.relations || []) {
    const url = rel.url?.resource;
    if (!url) continue;
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    const key = releaseLinkKeyForHost(host);
    if (key && !links[key]) links[key] = url;
  }
  return { links };
}
