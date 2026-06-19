/**
 * Shared URL validation for admin-supplied links/image URLs that get rendered
 * into the public site (footer links, hero/studio images). Blocks dangerous
 * schemes (`javascript:`, `data:`, `vbscript:`, …) so a stored value can't turn
 * into client-side script execution. Allows only absolute http(s) URLs or
 * site-relative paths (e.g. `/hero.png`).
 */
export function isSafeUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!s) return false;
  // Site-relative path, but NOT protocol-relative ("//evil.com") and not a
  // backslash trick ("/\evil.com") that browsers normalize to "//evil.com"
  // (an open redirect). Real URL paths never need a backslash.
  if (s.startsWith("/") && !s.startsWith("//") && !s.includes("\\")) return true;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
