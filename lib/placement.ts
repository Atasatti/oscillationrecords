// Placement tracker (Placement) — an internal wins log: playlist adds, radio
// spins, press/blog coverage. Pure — safe to import on server or client.

export const PLACEMENT_TYPES = ["playlist", "radio", "press", "other"] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number];

export const PLACEMENT_TYPE_LABELS: Record<PlacementType, string> = {
  playlist: "Playlist",
  radio: "Radio",
  press: "Press / blog",
  other: "Other",
};

export function isPlacementType(v: unknown): v is PlacementType {
  return typeof v === "string" && (PLACEMENT_TYPES as readonly string[]).includes(v);
}

export const placementStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** A valid 24-hex ObjectId or null (never a bad string) — for the optional
 *  release / artist links, which have no hard Prisma relation. */
export function objectIdOrNull(v: unknown): string | null {
  return typeof v === "string" && /^[a-f\d]{24}$/i.test(v) ? v : null;
}

/** Reach (followers/listeners) — a non-negative integer, or null if absent /
 *  unparseable. Capped to keep a hostile value from overflowing. */
export function normalizeReach(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(2_000_000_000, Math.floor(n));
}

/** A link — only http(s) URLs, so a stored value can't become a
 *  javascript:/data: href when rendered. Non-http(s) input is dropped. */
export function safeUrl(v: unknown): string | null {
  const s = placementStr(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

/** "YYYY-MM-DD" → a Date at UTC midnight of that day, or null. Anchored so
 *  trailing garbage is rejected; an ISO datetime's date part is accepted. */
export function toUtcDay(v: unknown): Date | null {
  const s = typeof v === "string" ? v.trim() : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (
    dt.getUTCFullYear() !== Number(y) ||
    dt.getUTCMonth() !== Number(mo) - 1 ||
    dt.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return dt;
}

/** "YYYY-MM-DD" for a date in UTC terms (how a placedOn date is displayed). */
export function dayKeyUtc(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mo}-${day}`;
}

export type PlacementInput = {
  type: PlacementType;
  outlet: string;
  name: string | null;
  url: string | null;
  reach: number | null;
  placedOn: Date | null;
  releaseId: string | null;
  artistId: string | null;
  notes: string | null;
};

/** Clean a full create body. Returns null if the required `outlet` is missing,
 *  so the route can 400 without a half-built record. `placedOn` is optional; an
 *  invalid date is treated as absent (null) rather than rejected. */
export function normalizePlacementInput(body: unknown): PlacementInput | null {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const outlet = placementStr(o.outlet, 200);
  if (!outlet) return null;
  return {
    type: isPlacementType(o.type) ? o.type : "playlist",
    outlet,
    name: placementStr(o.name, 200),
    url: safeUrl(o.url),
    reach: normalizeReach(o.reach),
    placedOn: o.placedOn ? toUtcDay(o.placedOn) : null,
    releaseId: objectIdOrNull(o.releaseId),
    artistId: objectIdOrNull(o.artistId),
    notes: placementStr(o.notes, 2000),
  };
}
