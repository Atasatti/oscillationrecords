// Artist URL slugs. Slugs are DERIVED from the artist name (not stored), so no
// schema change / DB backfill is needed: every reader computes the same slug
// from the name. The old `/artists/<id>` URLs still resolve and 308-redirect to
// the slug, so existing links/bookmarks never break.
//
// Caveat: because the slug comes from the name, renaming an artist changes their
// pretty URL. For a small curated roster that's an acceptable trade; switch to a
// stored `slug` field if permanence across renames is ever needed.

/** A 24-char hex Mongo ObjectId — i.e. a legacy id-based URL
 *  (`/artists/<id>`, `/releases/<id>`). */
export const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
/** Back-compat alias used by the artist routes. */
export const ARTIST_ID_RE = OBJECT_ID_RE;

/** Turn an artist name into a URL-safe slug, e.g. "BIGHECK" -> "bigheck". */
export function slugify(name: string): string {
  return (
    (name || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric -> hyphen
      .replace(/-{2,}/g, "-") // collapse repeats
      .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    || "artist"
  );
}
