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

// --- Label entity facts -----------------------------------------------------
// Single source of truth for the label-as-entity, shared by the Organization
// JSON-LD AND the visible About/FAQ copy so the machine-readable entity and the
// human-readable prose never drift. Filling the `null` TODO fields in is the
// single highest-leverage thing for entity disambiguation: it's how Google tells
// THIS "Oscillation Records" apart from "The Oscillation" and the homonym labels.
// Anything left null is simply omitted from the schema (never emitted as a
// placeholder), so it's safe to ship as-is and tighten later.
export const LABEL = {
  legalName: "Oscillation Records Ltd",
  // Confirmed: UK company register (also in the footer + Organization sameAs).
  companyNumber: "15579381",
  // Incorporated in 2022 (year only — exact date not confirmed). schema.org
  // foundingDate accepts a bare year.
  foundingDate: "2022" as string | null,
  // Founder — emitted as Organization.founder (Person).
  founder: "Ben Sharp Knowles" as string | null,
  // Primary city.
  city: "Manchester" as string | null,
  country: "United Kingdom",
  // TODO: set a public contact email for the label (e.g. "hello@oscillationrecords.com").
  email: null as string | null,
  // Primary musical focus. Not a schema.org Organization property, so it feeds the
  // description / FAQ / llms.txt rather than a structured field.
  genre: "EDM, dubstep, drum & bass, house and other genres" as string | null,
  // The label's own Wikidata item. Lets artist drafts cite "record label →
  // Oscillation Records" (P264) and links the Organization schema to Wikidata.
  wikidataId: "Q140353657" as string | null,
  // Names the label is also known by — helps reconcile name variants.
  alternateName: ["Oscillation Records Ltd", "OSCILLATION RECORDS LTD"],
  // One-line factual entity definition (feeds Organization.description + llms.txt).
  description:
    "Oscillation Records is an independent record label based in Manchester, United Kingdom (company no. 15579381), founded in 2022. It releases electronic music — EDM, dubstep, drum & bass and house — alongside other genres, built on a simple principle: put artists first.",
  // schema.org disambiguatingDescription — the property purpose-built for telling
  // similarly-named entities apart. Names the SPECIFIC entities search/AI engines
  // confuse us with, so each has an explicit "this is NOT that" signal.
  disambiguatingDescription:
    "Oscillation Records is a UK-registered independent record label (company no. 15579381) " +
    "based in Manchester, releasing electronic music (EDM, dubstep, drum & bass and house) and other genres. " +
    "It is a distinct entity and is NOT the same " +
    "as, nor affiliated with, any of these similarly-named acts: “The Oscillation”, the London " +
    "psychedelic / space-rock band led by Demian Castellanos; “Oscillations”, the London " +
    "experimental-electronic record label founded by Gabriel Prokofiev; or the Chilean " +
    "tech-house / techno duo also using the name “Oscillation Records” (Eban Krocker and Diego Herrera).",
} as const;

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Serialize a JSON-LD object for safe embedding inside
 * `<script type="application/ld+json" dangerouslySetInnerHTML>`.
 *
 * `JSON.stringify` does NOT HTML-escape, so any stored, admin-authored string
 * (artist/release name, biography, description, press title) that contains
 * `</script>` would terminate the script element early and let the following
 * bytes parse as live markup — stored XSS on every public visitor. Escaping the
 * breakout characters to their `\uXXXX` forms keeps the JSON valid for crawlers
 * while making a `</script>` (or U+2028/U+2029 line-separator) breakout
 * impossible. Use this everywhere JSON-LD is injected via dangerouslySetInnerHTML.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
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
  wikidataId?: string | null;
  wikipediaUrl?: string | null;
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
    artist.wikidataId ? `https://www.wikidata.org/wiki/${artist.wikidataId}` : null,
    artist.wikipediaUrl,
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
    // Tie every release to the label entity (reinforces the label's catalog in
    // the Knowledge Graph + AI engines).
    recordLabel: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      "@id": `${SITE_URL}/#organization`,
    },
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

// Authoritative third-party references to the SAME entity — official registries
// and music databases. Google reads Organization.sameAs to confirm/disambiguate
// the entity and build the Knowledge Graph. These are stable, so they live here
// (not in the editable footer socials). Add Discogs / Wikidata / LinkedIn etc.
// to this list as they come online.
const ORG_ENTITY_REFERENCES = [
  // Companies House (official UK company register).
  "https://find-and-update.company-information.service.gov.uk/company/15579381",
  // MusicBrainz label entity (high-signal music database).
  "https://musicbrainz.org/label/82eea2f1-164c-4da0-9a87-9a89ad4b7470",
  // Wikidata item — the Knowledge-Graph anchor.
  "https://www.wikidata.org/wiki/Q140353657",
];

/** schema.org Organization for the label itself (site-wide entity). */
export function buildOrganizationJsonLd(opts?: { sameAs?: string[] }) {
  const sameAs = Array.from(
    new Set(
      [...(opts?.sameAs ?? []), ...ORG_ENTITY_REFERENCES].filter((u) =>
        Boolean(u && u.trim())
      )
    )
  );
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: LABEL.legalName,
    description: LABEL.description,
    disambiguatingDescription: LABEL.disambiguatingDescription,
    url: SITE_URL,
    logo: absoluteUrl("/logo-icon.svg"),
  };
  if (LABEL.alternateName.length) {
    // Drop the display name itself so we don't list it as its own alias.
    const aliases = LABEL.alternateName.filter((n) => n && (n as string) !== SITE_NAME);
    if (aliases.length) jsonLd.alternateName = aliases;
  }
  if (LABEL.foundingDate) jsonLd.foundingDate = LABEL.foundingDate;
  if (LABEL.founder) jsonLd.founder = { "@type": "Person", name: LABEL.founder };
  if (LABEL.city || LABEL.country) {
    const address: Record<string, string> = {};
    if (LABEL.city) address.addressLocality = LABEL.city;
    if (LABEL.country) address.addressCountry = LABEL.country;
    jsonLd.address = { "@type": "PostalAddress", ...address };
  }
  if (LABEL.email) {
    jsonLd.contactPoint = {
      "@type": "ContactPoint",
      contactType: "A&R / general enquiries",
      email: LABEL.email,
    };
  }
  if (sameAs.length) jsonLd.sameAs = sameAs;
  return jsonLd;
}

/**
 * schema.org FAQPage — a recognised rich result, and high-signal for AI
 * Overviews, which lift clean Q&A pairs almost verbatim. Pair this with the SAME
 * questions/answers rendered as visible text on the page (Google requires the
 * markup to match on-page content). Ideal home for entity-disambiguation Q&A
 * ("Is Oscillation Records the same as The Oscillation?" → an explicit "No.").
 */
export function buildFaqJsonLd(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

/**
 * schema.org WebSite for the site entity. Google uses this to confirm the site
 * NAME shown in search results (the "site name" feature). We intentionally omit
 * the SearchAction / Sitelinks Searchbox — Google retired that rich result in
 * late 2024, so it would just be dead markup.
 */
export function buildWebSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
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
