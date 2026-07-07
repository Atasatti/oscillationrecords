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
  // Operating since 2021 (first releases); incorporated in the UK as Oscillation
  // Records Ltd in 2024. schema.org foundingDate is a single date, so it carries
  // the founding / first-activity year (2021); the 2024 incorporation lives in the
  // description prose so every source (site, Wikidata, MusicBrainz, Companies
  // House) tells one consistent story instead of three conflicting years.
  foundingDate: "2021" as string | null,
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
  // Names the label is also known by — helps reconcile name variants. Includes
  // the legal name (two casings) plus the location-qualified forms people search
  // for. Keep these identical to the aliases on the Wikidata item (Q140353657).
  alternateName: [
    "Oscillation Records Ltd",
    "OSCILLATION RECORDS LTD",
    "Oscillation Records UK",
    "Oscillation Records Manchester",
  ],
  // One-line factual entity definition (feeds Organization.description + llms.txt).
  description:
    "Oscillation Records is an independent record label based in Manchester, United Kingdom, releasing music since 2021 and incorporated as Oscillation Records Ltd (company no. 15579381) in 2024. It releases electronic music — EDM, dubstep, drum & bass and house — alongside other genres, built on a simple principle: put artists first.",
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
    "tech-house / techno duo also using the name “Oscillation Records” (Eban Krocker and Diego Herrera). " +
    "It is likewise unrelated to any other similarly-named “Oscillation” / “Oscillate” label or artist " +
    "appearing on Beatport, Bandcamp or Discogs.",
} as const;

// The SPECIFIC other entities that search / AI engines merge us with, expressed
// as schema.org `differentFrom` — the machine-readable analogue of Wikidata's
// P1889 ("different from"). This gives crawlers a typed edge to follow instead of
// forcing them to parse the disambiguatingDescription prose. Each points at the
// best public URI for that entity so Google can route ITS facts to ITS node
// rather than collapsing everything onto ours. Mirror these with reciprocal
// P1889 statements on Wikidata for the strongest effect.
const ORG_DIFFERENT_FROM = [
  {
    "@type": "MusicGroup",
    name: "The Oscillation",
    description:
      "London psychedelic / space-rock band led by Demian Castellanos (releases on Fuzz Club and Rough Trade).",
    sameAs: [
      "https://theoscillation.com",
      "https://www.discogs.com/artist/958895",
      // Wikidata item for the band (reciprocal "different from" P1889 with ours).
      "https://www.wikidata.org/wiki/Q140420345",
    ],
  },
  {
    "@type": "Organization",
    name: "Oscillations",
    description:
      "London experimental-electronic record label founded by Gabriel Prokofiev.",
    sameAs: ["https://oscillations-music.bandcamp.com/"],
  },
  {
    "@type": "MusicGroup",
    name: "Oscillation Records (Chilean tech-house / techno duo)",
    description:
      "Chilean tech-house / techno duo (Eban Krocker and Diego Herrera) who also release as “Oscillation Records”.",
  },
];

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

// schema.org MusicAlbumReleaseType — classifies a release as single / EP / album.
const ALBUM_RELEASE_TYPE: Record<string, string> = {
  single: "https://schema.org/SingleRelease",
  ep: "https://schema.org/EPRelease",
  album: "https://schema.org/AlbumRelease",
};

/** Seconds → ISO-8601 duration for schema.org `duration` (e.g. 222 → "PT3M42S"). */
function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = `${h ? `${h}H` : ""}${m ? `${m}M` : ""}`;
  // Always emit a seconds component if nothing else, so we never produce a bare "PT".
  return `PT${parts}${sec || !parts ? `${sec}S` : ""}`;
}

type ReleaseDetailLike = {
  id: string;
  name: string;
  type?: "single" | "ep" | "album";
  upcCode?: string | null;
  catalogueNumber?: string | null;
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
  tracks?: Array<{
    name: string;
    duration?: number | null;
    isrcCode?: string | null;
    iswc?: string | null;
  }>;
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
  if (release.type && ALBUM_RELEASE_TYPE[release.type]) {
    jsonLd.albumReleaseType = ALBUM_RELEASE_TYPE[release.type];
  }
  // UPC + label catalogue number as typed identifiers — the codes that uniquely pin
  // this release for Google/Bing/DSP reconciliation. (MusicAlbum has no direct
  // gtin/catalogNumber property, so both ride in `identifier` as PropertyValues.)
  const releaseIds: Array<Record<string, string>> = [];
  if (release.upcCode && release.upcCode.trim()) {
    releaseIds.push({ "@type": "PropertyValue", propertyID: "UPC", value: release.upcCode.trim() });
  }
  if (release.catalogueNumber && release.catalogueNumber.trim()) {
    releaseIds.push({
      "@type": "PropertyValue",
      propertyID: "catalogNumber",
      value: release.catalogueNumber.trim(),
    });
  }
  if (releaseIds.length) jsonLd.identifier = releaseIds.length === 1 ? releaseIds[0] : releaseIds;
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
    jsonLd.track = release.tracks.map((t, i) => {
      const rec: Record<string, unknown> = {
        "@type": "MusicRecording",
        name: t.name,
        position: i + 1,
      };
      if (t.duration && t.duration > 0) rec.duration = isoDuration(t.duration);
      // ISRC is a first-class MusicRecording property; ISWC (the composition code)
      // has no direct property, so it rides in `identifier` as a PropertyValue.
      if (t.isrcCode && t.isrcCode.trim()) rec.isrcCode = t.isrcCode.trim();
      if (t.iswc && t.iswc.trim()) {
        rec.identifier = { "@type": "PropertyValue", propertyID: "ISWC", value: t.iswc.trim() };
      }
      return rec;
    });
  }
  if (sameAs.length) jsonLd.sameAs = sameAs;
  return jsonLd;
}

type ReleaseCardLike = {
  name: string;
  type?: "single" | "ep" | "album";
  primaryArtistName?: string | null;
  thumbnail?: string | null;
  releaseDate?: string | null;
};

/**
 * schema.org CollectionPage + ItemList for the /releases catalogue page. Exposes
 * the whole discography as one machine-readable list, each entry a MusicAlbum tied
 * to the label entity (@id #organization). This gives search / AI engines the
 * catalogue in a single structured object and a crawl path to every release page —
 * directly strengthening the label's "record label with a catalogue" signal.
 */
export function buildReleaseListJsonLd(releases: ReleaseCardLike[]) {
  const itemListElement = releases
    .filter((r) => r && r.name && r.name.trim())
    .map((r, i) => {
      const url = absoluteUrl(`/releases/${slugify(r.name)}`);
      const album: Record<string, unknown> = {
        "@type": "MusicAlbum",
        "@id": url,
        url,
        name: r.name,
        recordLabel: { "@id": `${SITE_URL}/#organization` },
      };
      if (r.type && ALBUM_RELEASE_TYPE[r.type]) {
        album.albumReleaseType = ALBUM_RELEASE_TYPE[r.type];
      }
      if (r.primaryArtistName && r.primaryArtistName.trim()) {
        album.byArtist = {
          "@type": "MusicGroup",
          name: r.primaryArtistName,
          url: absoluteUrl(`/artists/${slugify(r.primaryArtistName)}`),
        };
      }
      if (r.thumbnail && r.thumbnail.trim()) album.image = r.thumbnail;
      if (r.releaseDate) {
        const d = new Date(r.releaseDate);
        if (!isNaN(d.getTime())) album.datePublished = d.toISOString().slice(0, 10);
      }
      return { "@type": "ListItem", position: i + 1, item: album };
    });

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${SITE_URL}/releases#catalog`,
    url: `${SITE_URL}/releases`,
    name: `Music — ${SITE_NAME}`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    about: { "@id": `${SITE_URL}/#organization` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: itemListElement.length,
      itemListElement,
    },
  };
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
    // Typed "this is NOT that" edges to the entities we get merged with.
    differentFrom: ORG_DIFFERENT_FROM,
    url: SITE_URL,
    // Bind the entity to its canonical home document so the homepage's principal
    // entity is explicit, not inferred.
    mainEntityOfPage: SITE_URL,
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
  publisher?: string | null;
  articleUrl?: string | null;
  summary?: string | null;
  image?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  /** Owned post (hosted on our site, has its own page) vs external coverage. */
  isOwned?: boolean;
  slug?: string;
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
  // An owned post lives on its own page and is authored by us; external coverage is
  // our summary node that links out to the outlet's Article via isBasedOn/citation.
  const isOwned = item.isOwned === true;
  const ownUrl = item.slug ? absoluteUrl(`/press/${item.slug}`) : pageUrl;
  const node: Record<string, unknown> = {
    "@type": "BlogPosting",
    headline: item.title,
    author: item.author
      ? { "@type": "Person", name: item.author }
      : { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: isOwned ? ownUrl : pageUrl,
  };
  if (isOwned) node.url = ownUrl;
  const desc = metaDescription(item.summary, 5000);
  if (desc) node.description = desc;
  if (item.image) node.image = absoluteUrl(item.image);
  if (item.publishedAt) {
    const d = new Date(item.publishedAt);
    if (!isNaN(d.getTime())) node.datePublished = d.toISOString().slice(0, 10);
  }

  // Only external coverage models a separate outlet Article (with its URL/outlet).
  if (!isOwned && item.articleUrl) {
    const article: Record<string, unknown> = {
      "@type": "Article",
      headline: item.title,
      url: item.articleUrl,
    };
    // Only name the outlet when we actually know it — a nameless Organization is
    // invalid/empty structured data.
    if (item.publisher && item.publisher.trim()) {
      article.publisher = { "@type": "Organization", name: item.publisher.trim() };
    }
    if (item.author) article.author = { "@type": "Person", name: item.author };
    node.isBasedOn = article;
    node.citation = article;
  }

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

/**
 * schema.org BlogPosting for ONE owned press post (its own /press/<slug> page).
 * Unlike buildPressListJsonLd's external-coverage nodes, WE are the author and
 * publisher here — it's our content hosted on our page — so mainEntityOfPage is
 * this page and there's no isBasedOn/citation to an outside outlet.
 */
export function buildPressPostJsonLd(post: {
  title: string;
  slug: string;
  summary?: string | null;
  body?: string | null;
  image?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  artists?: { name: string }[];
  releases?: { name: string }[];
}) {
  const url = absoluteUrl(`/press/${post.slug}`);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    url,
    "@id": url,
    mainEntityOfPage: url,
    author: post.author
      ? { "@type": "Person", name: post.author }
      : { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      "@id": `${SITE_URL}/#organization`,
    },
  };
  if (post.image) jsonLd.image = imageObject(post.image, post.title);
  const desc = metaDescription(post.summary, 5000);
  if (desc) jsonLd.description = desc;
  if (post.body && post.body.trim()) jsonLd.articleBody = post.body.trim();
  if (post.publishedAt) {
    const d = new Date(post.publishedAt);
    if (!isNaN(d.getTime())) jsonLd.datePublished = d.toISOString();
  }
  const mentions = [
    ...(post.artists ?? []).map((a) => ({
      "@type": "MusicGroup",
      name: a.name,
      url: absoluteUrl(`/artists/${slugify(a.name)}`),
    })),
    ...(post.releases ?? []).map((r) => ({
      "@type": "MusicAlbum",
      name: r.name,
      url: absoluteUrl(`/releases/${slugify(r.name)}`),
    })),
  ];
  if (mentions.length) jsonLd.mentions = mentions;
  return jsonLd;
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
