// SEO helpers: absolute URLs + schema.org JSON-LD builders.
//
// Structured data (schema.org) is what lets Google, Bing, and AI crawlers
// understand that a page is a *musician* with *releases* and *profiles* — not
// just prose. The `sameAs` links (Spotify, socials, MusicBrainz, ISNI) are how
// search engines reconcile the page to a real-world entity / knowledge panel.

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://oscillationrecords.com"
).replace(/\/$/, "");

export const SITE_NAME = "Oscillation Records";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Trim a bio to a clean meta-description length (~160 chars, word boundary). */
export function metaDescription(text: string | null | undefined, max = 160): string {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}

type ArtistLike = {
  id: string;
  name: string;
  biography?: string | null;
  profilePicture?: string | null;
  genres?: string[];
  isni?: string | null;
  musicBrainzId?: string | null;
  xLink?: string | null;
  tiktokLink?: string | null;
  spotifyLink?: string | null;
  instagramLink?: string | null;
  youtubeLink?: string | null;
  facebookLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  soundcloudLink?: string | null;
};

type ReleaseLike = { id: string; name: string; thumbnail?: string | null };

/** schema.org MusicGroup for an artist page (works for solo acts and bands). */
export function buildArtistJsonLd(artist: ArtistLike, releases: ReleaseLike[] = []) {
  const url = absoluteUrl(`/artists/${artist.id}`);
  const sameAs = [
    artist.xLink,
    artist.tiktokLink,
    artist.spotifyLink,
    artist.instagramLink,
    artist.youtubeLink,
    artist.facebookLink,
    artist.appleMusicLink,
    artist.tidalLink,
    artist.amazonMusicLink,
    artist.soundcloudLink,
    artist.musicBrainzId ? `https://musicbrainz.org/artist/${artist.musicBrainzId}` : null,
    artist.isni ? `https://isni.org/isni/${artist.isni}` : null,
  ].filter((u): u is string => Boolean(u && u.trim()));

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: artist.name,
    url,
    "@id": url,
  };
  if (artist.profilePicture) jsonLd.image = artist.profilePicture;
  const desc = metaDescription(artist.biography, 5000);
  if (desc) jsonLd.description = desc;
  if (artist.genres && artist.genres.length) jsonLd.genre = artist.genres;
  if (sameAs.length) jsonLd.sameAs = sameAs;
  if (releases.length) {
    jsonLd.album = releases.map((r) => ({
      "@type": "MusicAlbum",
      name: r.name,
      url: absoluteUrl(`/releases/${r.id}`),
      ...(r.thumbnail ? { image: r.thumbnail } : {}),
    }));
  }
  jsonLd.subjectOf = { "@type": "WebPage", url };
  return jsonLd;
}
