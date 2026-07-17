// A Mongo ObjectId — the id that sits in every admin entity route
// (/admin/release/<id>, /admin/artists/<id>/edit, …). Use this to validate an id
// BEFORE interpolating it into a navigation target, so a missing / null / stale
// value can never produce an invalid URL such as `/admin/artist/null` (which 404s).
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

export function isObjectId(id: unknown): id is string {
  return typeof id === "string" && OBJECT_ID_RE.test(id);
}
