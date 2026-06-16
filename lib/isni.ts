// Server-only ISNI lookup via the public OCLC SRU search API (free, no key).
// ISNI is the public identity identifier; Spotify registers ISNIs for streaming
// artists, so already-released acts often have one even if they're not yet in
// MusicBrainz. We search by name and return candidates for the admin to confirm.
// The SRU response is XML; we extract just what we need with light regex (no XML
// dep). Best-effort: returns [] on any error so it never blocks the editor.

const SRU_BASE = "https://isni.oclc.org/sru/";

export type IsniMatch = {
  isni: string; // 16 digits, unformatted
  name: string;
  type: string | null; // e.g. "Person", "Musical group or band"
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

function parseRecords(xml: string): IsniMatch[] {
  const chunks = xml.split("<srw:record>").slice(1);
  const out: IsniMatch[] = [];
  const seen = new Set<string>();
  for (const chunk of chunks) {
    const isni = firstMatch(chunk, /<isniUnformatted>(\d{16})<\/isniUnformatted>/);
    if (!isni || seen.has(isni)) continue;

    // Prefer an organisation/main name; fall back to a personal name.
    let name = firstMatch(chunk, /<mainName>([^<]+)<\/mainName>/);
    if (!name) {
      const surname = firstMatch(chunk, /<surname>([^<]+)<\/surname>/);
      const forename = firstMatch(chunk, /<forename>([^<]+)<\/forename>/);
      name = [forename, surname].filter(Boolean).join(" ") || null;
    }
    if (!name) continue;

    const type =
      firstMatch(chunk, /<organisationType>([^<]+)<\/organisationType>/) ??
      (/<personalName>/.test(chunk) ? "Person" : null);

    seen.add(isni);
    out.push({ isni, name, type });
  }
  return out;
}

/** Search ISNI by artist/person name. Returns [] on error. */
export async function searchIsni(name: string, max = 6): Promise<IsniMatch[]> {
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
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRecords(xml).slice(0, max);
  } catch {
    return [];
  }
}
