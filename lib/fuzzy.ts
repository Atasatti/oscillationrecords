// Fuzzy text matching for catalog search (navbar, admin lists). The catalog is
// small (label roster), so API routes fetch candidates and rank them here
// instead of relying on DB substring filters.

const strip = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// Minimum edits for `needle` to match anywhere inside `haystack` (Sellers
// algorithm — characters in haystack outside the matched window are free).
function substringEditDistance(needle: string, haystack: string): number {
  let prev: number[] = new Array(haystack.length + 1).fill(0);
  for (let i = 1; i <= needle.length; i++) {
    const cur: number[] = new Array(haystack.length + 1);
    cur[0] = i;
    for (let j = 1; j <= haystack.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (needle[i - 1] === haystack[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return Math.min(...prev);
}

// Returns 0 for no match, higher = better. Ignores case, spacing, punctuation
// and diacritics ("bigheck" matches "Big Heck"), and tolerates typos scaled
// to query length (1 edit for 5–8 chars, 2 edits above that).
export function fuzzyScore(query: string, target: string): number {
  const q = strip(query);
  const t = strip(target);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 80;
  const maxEdits = q.length <= 4 ? 0 : q.length <= 8 ? 1 : 2;
  if (maxEdits === 0) return 0;
  const dist = substringEditDistance(q, t);
  return dist <= maxEdits ? 70 - dist * 10 : 0;
}
