// Server-only ISNI lookup via the public OCLC SRU search API (free, no key).
// ISNI is the public identity identifier; Spotify registers ISNIs for streaming
// artists, so already-released acts often have one even if they're not yet in
// MusicBrainz. We search by name and return candidates for the admin to confirm.
//
// The hard part is verification: ISNI indexes EVERY named entity (companies,
// orgs, people), not just musicians — a name search for "BSK" returns
// corporations too. So we extract verification signals from each record (entity
// type, contributing sources like MusicBrainz/VIAF, external links like Discogs,
// and work titles), flag music entities, and rank them first, so the admin can
// tell the artist apart from the noise.
//
// The SRU response is XML; we extract with light regex (no XML dep). Best-effort:
// returns [] on any error so it never blocks the editor.

const SRU_BASE = "https://isni.oclc.org/sru/";

// Friendly names for the short ISNI source codes worth recognising.
const SOURCE_LABELS: Record<string, string> = {
  MUBZ: "MusicBrainz",
  VIAF: "VIAF",
  BNF: "BnF",
  DNB: "DNB",
  LCNACO: "Library of Congress",
  LC: "Library of Congress",
  WKP: "Wikidata",
  WKD: "Wikidata",
  ISNI: "ISNI",
  UMG: "Universal",
  SODA: "Discogs",
};

// Creation roles / classes that signal a music entity.
const MUSIC_ROLES = new Set([
  "prf", // performer
  "cmp", // composer
  "com", // composer (alt)
  "arr", // arranger
  "cnd", // conductor
  "mus", // musician
  "sng", // singer
]);

export type IsniMatch = {
  isni: string; // 16 digits, unformatted
  name: string;
  type: string | null; // e.g. "Person", "Musical group or band"
  sources: string[]; // friendly source names (MusicBrainz, VIAF, …)
  links: string[]; // external URLs (Discogs, etc.) + the isni.org page
  works: string[]; // a few work titles, when present
  isMusic: boolean; // ranked first + badged in the UI
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function firstMatch(chunk: string, re: RegExp): string | null {
  const m = chunk.match(re);
  return m ? decode(m[1]) : null;
}

function allMatches(chunk: string, re: RegExp): string[] {
  return [...chunk.matchAll(re)].map((m) => decode(m[1]));
}

function parseRecord(chunk: string): IsniMatch | null {
  const isni = firstMatch(chunk, /<isniUnformatted>(\d{16})<\/isniUnformatted>/);
  if (!isni) return null;

  // Prefer an organisation/main name; fall back to a personal name.
  let name = firstMatch(chunk, /<mainName>([^<]+)<\/mainName>/);
  if (!name) {
    const surname = firstMatch(chunk, /<surname>([^<]+)<\/surname>/);
    const forename = firstMatch(chunk, /<forename>([^<]+)<\/forename>/);
    name = [forename, surname].filter(Boolean).join(" ") || null;
  }
  if (!name) return null;

  const orgType = firstMatch(chunk, /<organisationType>([^<]+)<\/organisationType>/);
  const isPerson = /<personalName>/.test(chunk);
  const type = orgType ?? (isPerson ? "Person" : null);

  const rawSources = [...new Set(allMatches(chunk, /<source>([^<]+)<\/source>/g))];
  const sources = [
    ...new Set(rawSources.map((c) => SOURCE_LABELS[c] ?? c)),
  ];

  // External links live in <externalInformation><URI>…</URI>; the isni.org page
  // is <isniURI>. Surface both (isni.org last) so the admin can click through.
  const externalLinks = allMatches(chunk, /<URI>([^<]+)<\/URI>/g).filter(
    (u) => !u.includes("isni.org")
  );
  const links = [...new Set([...externalLinks, `https://isni.org/isni/${isni}`])];

  const works = [...new Set(allMatches(chunk, /<title>([^<]+)<\/title>/g))].slice(0, 5);

  const roles = allMatches(chunk, /<creationRole[^>]*>([^<]+)<\/creationRole>/g);
  const classes = allMatches(chunk, /<creationClass[^>]*>([^<]+)<\/creationClass>/g);
  const isMusic =
    (orgType ? /music/i.test(orgType) : false) ||
    rawSources.includes("MUBZ") ||
    roles.some((r) => MUSIC_ROLES.has(r)) ||
    classes.some((c) => /^(jm|cm)/i.test(c));

  return { isni, name, type, sources, links, works, isMusic };
}

function parseRecords(xml: string): IsniMatch[] {
  const chunks = xml.split("<srw:record>").slice(1);
  const out: IsniMatch[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const rec = parseRecord(chunk);
    if (!rec || seen.has(rec.isni)) continue;
    seen.add(rec.isni);
    out.push(rec);
  }
  // Music entities first; otherwise preserve the registry's relevance order.
  return out
    .map((rec, i) => ({ rec, i }))
    .sort((a, b) => Number(b.rec.isMusic) - Number(a.rec.isMusic) || a.i - b.i)
    .map((x) => x.rec);
}

/** Search ISNI by artist/person name. Returns [] on error. */
export async function searchIsni(name: string, max = 8): Promise<IsniMatch[]> {
  const q = name.trim();
  if (!q) return [];
  // CQL "name word" index; quote the value.
  const cql = `pica.nw = "${q.replace(/"/g, "")}"`;
  const url =
    `${SRU_BASE}?operation=searchRetrieve&version=1.1&recordSchema=isni-b` +
    `&maximumRecords=${max}&query=${encodeURIComponent(cql)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/xml",
        "User-Agent":
          process.env.MUSICBRAINZ_USER_AGENT ||
          "OscillationRecords/1.0 ( admin@oscillationrecords.com )",
      },
      // Bound the request so a hung ISNI/OCLC upstream can't stall the route.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRecords(xml).slice(0, max);
  } catch {
    return [];
  }
}
