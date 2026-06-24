// Fold listener-country values onto one canonical English name, so the same
// country never appears twice in analytics. CDN geo headers give ISO codes
// ("GB"); user-profile demographics store English names ("United Kingdom").
// Converting codes -> names (and leaving names as-is) lands both on the same key
// — and side-steps ISO aliases like GB/UK that a name->code reverse lookup gets
// wrong (Intl resolves both "GB" and "UK" to "United Kingdom").

let region: Intl.DisplayNames | null | undefined;

function regionNames(): Intl.DisplayNames | null {
  if (region === undefined) {
    try {
      region = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      region = null;
    }
  }
  return region ?? null;
}

/**
 * Canonical country label for a 2-letter ISO code OR an English name. A code is
 * expanded to its English country name; a name is returned trimmed. Empty/unknown
 * input returns null / the trimmed original, so values still group consistently.
 */
export function canonicalCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) {
    const dn = regionNames();
    if (dn) {
      try {
        const name = dn.of(v.toUpperCase());
        if (name && name.toUpperCase() !== v.toUpperCase()) return name;
      } catch {
        /* not a known region code — fall through */
      }
    }
    return v.toUpperCase();
  }
  return v;
}
