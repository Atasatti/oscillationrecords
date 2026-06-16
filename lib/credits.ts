/**
 * Flexible credits shared by releases and tracks: an ordered list of
 * { role, people[] } entries (e.g. Producer: [A, B], Songwriter: [C]). Stored as
 * JSON on Release.credits and Track.trackCredits.
 */

export type CreditEntry = { role: string; people: string[] };

/** Common roles offered in the editor; admins can also type a custom role. */
export const COMMON_CREDIT_ROLES = [
  "Producer",
  "Executive Producer",
  "Composer",
  "Songwriter",
  "Lyricist",
  "Performer",
  "Vocals",
  "Instrumentation",
  "Arranger",
  "Mixing Engineer",
  "Mastering Engineer",
  "Recording Engineer",
  "Artwork",
] as const;

/**
 * Coerce arbitrary input (from a form or the DB Json column) into a clean
 * CreditEntry[]: trims, drops empty roles/people, accepts `people` as an array
 * or a comma-separated string.
 */
export function normalizeCredits(input: unknown): CreditEntry[] {
  if (!Array.isArray(input)) return [];
  const out: CreditEntry[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const r = row as { role?: unknown; people?: unknown };
    const role = typeof r.role === "string" ? r.role.trim() : "";
    let people: string[] = [];
    if (Array.isArray(r.people)) {
      people = r.people.map((p) => String(p).trim()).filter(Boolean);
    } else if (typeof r.people === "string") {
      people = r.people.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (role && people.length > 0) out.push({ role, people });
  }
  return out;
}
