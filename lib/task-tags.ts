// Freeform task tags — trimmed, deduped (case-insensitive, first spelling wins),
// and capped. Pure — safe on server or client.

export const MAX_TAGS = 20;
export const MAX_TAG_LEN = 40;

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const s = t.trim().slice(0, MAX_TAG_LEN);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
