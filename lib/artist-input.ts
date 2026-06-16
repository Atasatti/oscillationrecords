// Shared normalization for the "extra" artist fields added for scale:
// genres + stored Spotify id + internal identity/management fields.
// Used by both POST /api/artists and PUT /api/artists/[id] so create and edit
// stay in lockstep. Keeps the public/legacy fields out — those are handled
// explicitly in the routes.

export type ArtistExtras = {
  genres: string[];
  spotifyId: string | null;
  realName: string | null;
  country: string | null;
  city: string | null;
  managerName: string | null;
  contactEmail: string | null;
  internalNotes: string | null;
};

/** Accept `string[]` or a comma-separated string → trimmed, de-duped, non-empty. */
export function normalizeGenres(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of raw) {
    const v = String(g).trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

const cleanStr = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
};

// Loose email shape check — we only want to avoid storing obvious garbage, not
// enforce RFC 5322. Returns the trimmed value, or null if empty/invalid.
const cleanEmail = (v: unknown): string | null => {
  const s = cleanStr(v);
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
};

/** Extract + normalize the new artist fields from a request body. */
export function extractArtistExtras(body: Record<string, unknown>): ArtistExtras {
  return {
    genres: normalizeGenres(body.genres),
    spotifyId: cleanStr(body.spotifyId),
    realName: cleanStr(body.realName),
    country: cleanStr(body.country),
    city: cleanStr(body.city),
    managerName: cleanStr(body.managerName),
    contactEmail: cleanEmail(body.contactEmail),
    internalNotes: cleanStr(body.internalNotes),
  };
}
