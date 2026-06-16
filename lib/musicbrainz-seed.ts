// Build "one-click" MusicBrainz submission links from our own data.
//
// MusicBrainz has no silent write API for full entities — contributions go
// through its editor, which can be SEEDED (pre-filled) via URL params and then
// reviewed + submitted by a logged-in editor. These helpers produce those seed
// links so an admin can add an artist/release in one click + a confirm.
//
// - Artists  → MusicBrainz "Add Artist" form (we seed name, area, and the
//   social/streaming URLs; MB auto-detects each relationship type by domain).
// - Releases → Harmony (harmony.pulsewidth.org.uk), which takes a streaming URL
//   and/or barcode, fetches the full tracklist, and builds the MB release seed.
//
// Pure + client-safe (no secrets, no server deps).

const MB_BASE = "https://musicbrainz.org";
const HARMONY_BASE = "https://harmony.pulsewidth.org.uk";

export type ArtistSeedInput = {
  name: string;
  country?: string | null;
  /** Social / streaming profile URLs (empty/falsey entries are dropped). */
  urls?: Array<string | null | undefined>;
};

/**
 * Link to MusicBrainz's "Add Artist" form, pre-seeded. We seed only the URL
 * text per relationship; MusicBrainz's external-link editor auto-selects the
 * relationship type from the domain for known sites (Spotify, Instagram, etc.).
 */
export function buildArtistSeedUrl(input: ArtistSeedInput): string {
  const params = new URLSearchParams();
  const name = input.name.trim();
  params.set("edit-artist.name", name);
  params.set("edit-artist.sort_name", name);
  if (input.country && input.country.trim()) {
    params.set("edit-artist.area.name", input.country.trim());
  }
  const urls = (input.urls ?? [])
    .map((u) => (u ?? "").trim())
    .filter((u) => u.length > 0);
  urls.forEach((url, i) => {
    params.set(`edit-artist.url.${i}.text`, url);
  });
  return `${MB_BASE}/artist/create?${params.toString()}`;
}

export type ReleaseSeedInput = {
  /** Barcode / UPC (preferred — most reliable lookup). */
  gtin?: string | null;
  /** Streaming URLs (Spotify/Apple/etc.) Harmony can resolve the tracklist from. */
  urls?: Array<string | null | undefined>;
};

/** True when there's enough to look a release up on Harmony (a barcode or a URL). */
export function canSeedRelease(input: ReleaseSeedInput): boolean {
  const hasGtin = Boolean(input.gtin && input.gtin.trim());
  const hasUrl = (input.urls ?? []).some((u) => (u ?? "").trim().length > 0);
  return hasGtin || hasUrl;
}

/**
 * Link to Harmony's release lookup, pre-filled with the barcode and/or streaming
 * URLs. Harmony aggregates the metadata and produces the MusicBrainz release
 * seed for the admin to review and submit.
 */
export function buildHarmonyReleaseUrl(input: ReleaseSeedInput): string {
  const params = new URLSearchParams();
  if (input.gtin && input.gtin.trim()) params.set("gtin", input.gtin.trim());
  (input.urls ?? [])
    .map((u) => (u ?? "").trim())
    .filter((u) => u.length > 0)
    .forEach((url) => params.append("url", url));
  params.set("category", "all");
  return `${HARMONY_BASE}/release?${params.toString()}`;
}
