// Wikidata reconciliation + assisted-creation helpers (server-side only).
//
// Two jobs, both keeping a human in control:
//  1. FIND — given what we already store (MusicBrainz ID, ISNI, name), look up an
//     EXISTING Wikidata item so we can link it (read-only; no auth, no writes).
//  2. DRAFT — for artists with no item yet, build a QuickStatements batch the
//     admin reviews and submits themselves. We never POST to Wikidata directly:
//     a label auto-creating items for its own roster is exactly the kind of
//     conflict-of-interest / mass-creation that gets accounts blocked.
//
// All outbound calls set a descriptive User-Agent (Wikimedia policy requires it).

import { SITE_URL, LABEL } from "@/lib/seo";

const UA = `OscillationRecords/1.0 (${SITE_URL})`;

// Wikidata property/item ids we use. Kept here so the QS builder reads clearly.
const P = {
  instanceOf: "P31",
  occupation: "P106",
  countryOfCitizenship: "P27",
  musicBrainzArtist: "P434",
  isni: "P213",
  ipi: "P1828",
  spotifyArtist: "P1902",
  recordLabel: "P264",
  instagram: "P2003",
  twitter: "P2002",
  tiktok: "P7085",
  soundcloud: "P3040",
  facebook: "P2013",
  youtubeChannel: "P2397",
  youtubeHandle: "P11245",
} as const;
const Q = {
  human: "Q5",
  musician: "Q639669",
} as const;

// Country string (name or ISO code, as we store it) → Wikidata QID. Only the
// common ones; an unmapped value is simply omitted rather than guessed wrong.
const COUNTRY_QID: Record<string, string> = {
  "united kingdom": "Q145", uk: "Q145", gb: "Q145", gbr: "Q145",
  england: "Q145", scotland: "Q145", wales: "Q145",
  "united states": "Q30", "united states of america": "Q30", usa: "Q30", us: "Q30",
  ireland: "Q27", france: "Q142", germany: "Q183", spain: "Q29", italy: "Q38",
  netherlands: "Q55", belgium: "Q31", portugal: "Q45", canada: "Q16",
  australia: "Q408", "new zealand": "Q664", sweden: "Q34", norway: "Q20",
  denmark: "Q35", finland: "Q33", poland: "Q36", japan: "Q17", brazil: "Q155",
};

/** First path segment of a URL on a given host (handles, usernames), or null. */
function handleFromUrl(url: string | null | undefined, hostFragment: string): string | null {
  if (!url || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (!u.hostname.toLowerCase().includes(hostFragment)) return null;
    const seg = u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0] || "";
    const handle = seg.replace(/^@/, "");
    return handle || null;
  } catch {
    return null;
  }
}

export type WikidataMatch = {
  id: string; // Q-number
  label: string;
  description: string | null;
  url: string;
  /** How we found it — an exact identifier hit is far stronger than a name guess. */
  via: "musicbrainz" | "isni" | "name";
};

/** ISNI is stored as 16 bare digits; Wikidata holds it grouped "XXXX XXXX XXXX XXXX". */
function formatIsni(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 16) return null;
  return d.replace(/(.{4})(.{4})(.{4})(.{4})/, "$1 $2 $3 $4");
}

async function wdFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    // These are public, slow-changing lookups — let the platform cache briefly.
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  return res.json();
}

/** Exact-match an external identifier via the SPARQL endpoint. */
async function findByIdentifier(
  property: string,
  value: string,
  via: WikidataMatch["via"]
): Promise<WikidataMatch[]> {
  const sparql = `SELECT ?item ?itemLabel ?itemDescription WHERE {
    ?item wdt:${property} "${value.replace(/"/g, '\\"')}" .
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } LIMIT 5`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const data = (await wdFetch(url)) as {
    results?: { bindings?: Array<Record<string, { value: string }>> };
  };
  const rows = data.results?.bindings ?? [];
  return rows.map((r) => {
    const id = (r.item?.value ?? "").split("/").pop() || "";
    return {
      id,
      label: r.itemLabel?.value || id,
      description: r.itemDescription?.value || null,
      url: `https://www.wikidata.org/wiki/${id}`,
      via,
    };
  });
}

/** Fuzzy name search via the action API (returns candidates for a human to judge). */
async function findByName(name: string): Promise<WikidataMatch[]> {
  const url =
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*` +
    `&language=en&uselang=en&type=item&limit=7&search=${encodeURIComponent(name)}`;
  const data = (await wdFetch(url)) as {
    search?: Array<{ id: string; label?: string; description?: string }>;
  };
  return (data.search ?? []).map((s) => ({
    id: s.id,
    label: s.label || s.id,
    description: s.description || null,
    url: `https://www.wikidata.org/wiki/${s.id}`,
    via: "name" as const,
  }));
}

export type ArtistForWikidata = {
  name: string;
  musicBrainzId?: string | null;
  isni?: string | null;
  spotifyId?: string | null;
  biography?: string | null;
  country?: string | null;
  genres?: string[] | null;
  ipis?: string[] | null;
  instagramLink?: string | null;
  xLink?: string | null;
  tiktokLink?: string | null;
  soundcloudLink?: string | null;
  facebookLink?: string | null;
  youtubeLink?: string | null;
};

/**
 * Find existing Wikidata items for an artist. Identifier hits (MusicBrainz/ISNI)
 * come first as "strong" matches; name candidates follow for the human to weigh.
 * De-duplicates by Q-number, preferring the strongest `via`.
 */
export async function findWikidataMatches(
  artist: ArtistForWikidata
): Promise<{ strong: WikidataMatch[]; candidates: WikidataMatch[] }> {
  const tasks: Array<Promise<WikidataMatch[]>> = [];
  if (artist.musicBrainzId?.trim()) {
    tasks.push(findByIdentifier(P.musicBrainzArtist, artist.musicBrainzId.trim(), "musicbrainz"));
  }
  const isni = artist.isni ? formatIsni(artist.isni) : null;
  if (isni) tasks.push(findByIdentifier(P.isni, isni, "isni"));
  if (artist.name?.trim()) tasks.push(findByName(artist.name.trim()));

  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // Dedupe by id, keeping the strongest provenance (identifier beats name).
  const rank = { musicbrainz: 0, isni: 1, name: 2 } as const;
  const byId = new Map<string, WikidataMatch>();
  for (const m of all) {
    if (!m.id) continue;
    const existing = byId.get(m.id);
    if (!existing || rank[m.via] < rank[existing.via]) byId.set(m.id, m);
  }
  const merged = Array.from(byId.values());
  return {
    strong: merged.filter((m) => m.via !== "name"),
    candidates: merged.filter((m) => m.via === "name"),
  };
}

/**
 * Signals that say whether an artist is worth creating a Wikidata item for.
 * Independent identifiers (MusicBrainz, ISNI) are what keep an item from being
 * deleted as non-notable — so we surface them rather than guessing.
 */
export function artistNotabilitySignals(artist: ArtistForWikidata): {
  haveRefs: string[];
  missingRefs: string[];
  ready: boolean;
} {
  const have: string[] = [];
  const missing: string[] = [];
  (artist.musicBrainzId?.trim() ? have : missing).push("MusicBrainz ID");
  (artist.isni?.trim() ? have : missing).push("ISNI");
  // Two or more independent identifiers is a reasonable "safe to create" bar.
  return { haveRefs: have, missingRefs: missing, ready: have.length >= 1 };
}

const qsEscape = (s: string) => s.replace(/[\t\n\r]/g, " ").replace(/"/g, '\\"').trim();

/**
 * Build a QuickStatements V1 batch that CREATES an item for the artist from the
 * data we hold. Deliberately conservative: it sets `instance of: human` by
 * default (true for most of the roster) — the admin must switch it to musical
 * group (Q215380) for bands during review. Identifier statements double as the
 * references that justify the item.
 */
export function buildArtistQuickStatements(artist: ArtistForWikidata): string {
  const lines: string[] = ["CREATE"];
  const idStmt = (prop: string, value: string | null | undefined) => {
    if (value && value.trim()) lines.push(`LAST\t${prop}\t"${qsEscape(value)}"`);
  };

  // Label + a short, neutral description (NOT the bio — Wikidata descriptions are
  // a disambiguating phrase, and pasting marketing prose reads as promotional).
  const genre = (artist.genres ?? []).map((g) => g?.trim()).find(Boolean);
  const description = genre ? `${genre.toLowerCase()} musician` : "musician";

  lines.push(`LAST\tLen\t"${qsEscape(artist.name)}"`);
  lines.push(`LAST\tDen\t"${qsEscape(description)}"`);
  lines.push(`LAST\t${P.instanceOf}\t${Q.human}`); // ← review: Q215380 if a band
  lines.push(`LAST\t${P.occupation}\t${Q.musician}`);

  const countryQid = COUNTRY_QID[(artist.country || "").trim().toLowerCase()];
  if (countryQid) lines.push(`LAST\t${P.countryOfCitizenship}\t${countryQid}`);

  // External identifiers — the references that justify the item.
  idStmt(P.musicBrainzArtist, artist.musicBrainzId);
  const isni = artist.isni ? formatIsni(artist.isni) : null;
  if (isni) lines.push(`LAST\t${P.isni}\t"${isni}"`);
  idStmt(P.spotifyArtist, artist.spotifyId);
  for (const ipi of artist.ipis ?? []) idStmt(P.ipi, ipi);

  // Social / streaming handles, extracted from the stored profile URLs.
  idStmt(P.instagram, handleFromUrl(artist.instagramLink, "instagram.com"));
  idStmt(P.twitter, handleFromUrl(artist.xLink, "twitter.com") ?? handleFromUrl(artist.xLink, "x.com"));
  idStmt(P.tiktok, handleFromUrl(artist.tiktokLink, "tiktok.com"));
  idStmt(P.soundcloud, handleFromUrl(artist.soundcloudLink, "soundcloud.com"));
  idStmt(P.facebook, handleFromUrl(artist.facebookLink, "facebook.com"));
  // YouTube: only the two unambiguous URL shapes — /channel/UC… (channel id) and
  // /@handle (handle). Other shapes (/c/Name, /user/Name) need resolving, so skip.
  const ytUrl = (artist.youtubeLink || "").trim();
  const ytChannel = ytUrl.match(/\/channel\/(UC[\w-]+)/)?.[1];
  const ytHandle = ytUrl.match(/\/@([\w.-]+)/)?.[1];
  if (ytChannel) idStmt(P.youtubeChannel, ytChannel);
  else if (ytHandle) idStmt(P.youtubeHandle, ytHandle);

  if (LABEL.wikidataId) lines.push(`LAST\t${P.recordLabel}\t${LABEL.wikidataId}`);
  return lines.join("\n");
}

/**
 * A pre-filled QuickStatements URL the admin opens, reviews, and submits.
 *
 * The QuickStatements URL loader does NOT read literal tabs/newlines — its `v1`
 * parameter uses `|` between fields and `||` between commands. (The copy-paste
 * version keeps tabs/newlines, which is what the on-page text box expects.)
 */
export function quickStatementsUrl(commands: string): string {
  const compact = commands
    .split("\n")
    .map((line) => line.split("\t").join("|"))
    .join("||");
  return `https://quickstatements.toolforge.org/#/v1=${encodeURIComponent(compact)}`;
}
