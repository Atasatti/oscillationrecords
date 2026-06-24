// SEO helpers: absolute URLs + schema.org JSON-LD builders.
//
// Structured data (schema.org) is what lets Google, Bing, and AI crawlers
// understand that a page is a *musician* with *releases* and *profiles* — not
// just prose. The `sameAs` links (Spotify, socials, MusicBrainz, ISNI) are how
// search engines reconcile the page to a real-world entity / knowledge panel.

import { slugify } from "@/lib/slug";

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
  country?: string | null;
  city?: string | null;
};

type ReleaseLike = { id: string; name: string; thumbnail?: string | null };

/** schema.org ImageObject — richer than a bare URL (lets us attach a caption). */
function imageObject(url: string, caption: string) {
  return { "@type": "ImageObject", url: absoluteUrl(url), caption };
}

/** schema.org Place from a city/country, or null if neither is set. */
function buildPlace(city?: string | null, country?: string | null) {
  const address: Record<string, string> = {};
  if (city && city.trim()) address.addressLocality = city.trim();
  if (country && country.trim()) address.addressCountry = country.trim();
  if (!Object.keys(address).length) return null;
  return { "@type": "Place", address: { "@type": "PostalAddress", ...address } };
}

/** schema.org MusicGroup for an artist page (works for solo acts and bands). */
export function buildArtistJsonLd(artist: ArtistLike, releases: ReleaseLike[] = []) {
  const url = absoluteUrl(`/artists/${slugify(artist.name)}`);
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
    // Ties each artist to the label entity — directly reinforces
    // "Oscillation Records <artist>" searches and the label knowledge graph.
    recordLabel: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      "@id": `${SITE_URL}/#organization`,
    },
  };
  if (artist.profilePicture) jsonLd.image = imageObject(artist.profilePicture, artist.name);
  const desc = metaDescription(artist.biography, 5000);
  if (desc) jsonLd.description = desc;
  if (artist.genres && artist.genres.length) jsonLd.genre = artist.genres;
  const place = buildPlace(artist.city, artist.country);
  if (place) jsonLd.foundingLocation = place;
  if (sameAs.length) jsonLd.sameAs = sameAs;
  if (releases.length) {
    jsonLd.album = releases.map((r) => ({
      "@type": "MusicAlbum",
      name: r.name,
      url: absoluteUrl(`/releases/${slugify(r.name)}`),
      ...(r.thumbnail ? { image: absoluteUrl(r.thumbnail) } : {}),
    }));
  }
  jsonLd.subjectOf = { "@type": "WebPage", url };
  return jsonLd;
}

type ReleaseDetailLike = {
  id: string;
  name: string;
  coverImage?: string | null;
  description?: string | null;
  releaseDate?: string | Date | null;
  genres?: Array<string | null | undefined>;
  primaryArtists?: { id: string; name: string }[];
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  tracks?: Array<{ name: string }>;
};

/** schema.org MusicAlbum for a release page. */
export function buildReleaseJsonLd(release: ReleaseDetailLike) {
  const url = absoluteUrl(`/releases/${slugify(release.name)}`);
  const genres = (release.genres ?? [])
    .map((g) => (g || "").trim())
    .filter((g): g is string => g.length > 0);
  const sameAs = [
    release.spotifyLink,
    release.appleMusicLink,
    release.tidalLink,
    release.amazonMusicLink,
    release.youtubeLink,
    release.soundcloudLink,
  ].filter((u): u is string => Boolean(u && u.trim()));

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicAlbum",
    name: release.name,
    url,
    "@id": url,
  };
  if (release.coverImage) jsonLd.image = imageObject(release.coverImage, release.name);
  const desc = metaDescription(release.description, 5000);
  if (desc) jsonLd.description = desc;
  if (genres.length) jsonLd.genre = genres;
  if (release.releaseDate) {
    const d = new Date(release.releaseDate);
    if (!isNaN(d.getTime())) jsonLd.datePublished = d.toISOString().slice(0, 10);
  }
  if (release.primaryArtists?.length) {
    const byArtist = release.primaryArtists.map((a) => ({
      "@type": "MusicGroup",
      name: a.name,
      url: absoluteUrl(`/artists/${slugify(a.name)}`),
    }));
    // schema.org byArtist accepts one or many — keep a bare object when single.
    jsonLd.byArtist = byArtist.length === 1 ? byArtist[0] : byArtist;
  }
  if (release.tracks && release.tracks.length) {
    jsonLd.numTracks = release.tracks.length;
    jsonLd.track = release.tracks.map((t, i) => ({
      "@type": "MusicRecording",
      name: t.name,
      position: i + 1,
    }));
  }
  if (sameAs.length) jsonLd.sameAs = sameAs;
  return jsonLd;
}

/**
 * schema.org BreadcrumbList — a recognised rich-result that shows the page's
 * place in the site hierarchy (Home › Artists › Name) in search listings.
 * `items` are ordered root → current; each `url` may be relative or absolute.
 */
export function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.url),
    })),
  };
}

/** schema.org Organization for the label itself (site-wide entity). */
export function buildOrganizationJsonLd(opts?: { sameAs?: string[] }) {
  const sameAs = (opts?.sameAs ?? []).filter((u) => Boolean(u && u.trim()));
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/logo-icon.svg"),
  };
  if (sameAs.length) jsonLd.sameAs = sameAs;
  return jsonLd;
}

type PressItemLike = {
  id: string;
  title: string;
  publisher: string;
  articleUrl: string;
  summary?: string | null;
  image?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  artists?: { id: string; name: string }[];
  releases?: { id: string; name: string }[];
};

/**
 * One press item as a schema.org BlogPosting (a node for the /press CollectionPage,
 * so no own @context). We are the AUTHOR/PUBLISHER of the summary only — the
 * external article is modelled as a separate Article node (its real outlet as
 * publisher, the journalist as author) and linked via isBasedOn/citation. We
 * deliberately emit NO Review/AggregateRating (citing third-party reviews as our
 * own machine-readable ratings violates Google's review-snippet rules).
 */
function buildPressBlogPosting(item: PressItemLike, pageUrl: string) {
  const node: Record<string, unknown> = {
    "@type": "BlogPosting",
    headline: item.title,
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: pageUrl,
  };
  const desc = metaDescription(item.summary, 5000);
  if (desc) node.description = desc;
  if (item.image) node.image = absoluteUrl(item.image);
  if (item.publishedAt) {
    const d = new Date(item.publishedAt);
    if (!isNaN(d.getTime())) node.datePublished = d.toISOString().slice(0, 10);
  }

  const article: Record<string, unknown> = {
    "@type": "Article",
    headline: item.title,
    url: item.articleUrl,
    publisher: { "@type": "Organization", name: item.publisher },
  };
  if (item.author) article.author = { "@type": "Person", name: item.author };
  node.isBasedOn = article;
  node.citation = article;

  const mentions = [
    ...(item.artists ?? []).map((a) => ({
      "@type": "MusicGroup",
      name: a.name,
      url: absoluteUrl(`/artists/${slugify(a.name)}`),
    })),
    ...(item.releases ?? []).map((r) => ({
      "@type": "MusicAlbum",
      name: r.name,
      url: absoluteUrl(`/releases/${slugify(r.name)}`),
    })),
  ];
  if (mentions.length) node.mentions = mentions;
  return node;
}

/** schema.org CollectionPage for the /press index, with each item as a BlogPosting. */
export function buildPressListJsonLd(items: PressItemLike[]) {
  const url = absoluteUrl("/press");
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Press & Features — ${SITE_NAME}`,
    url,
    "@id": url,
    hasPart: items.map((it) => buildPressBlogPosting(it, url)),
  };
}
