// A&R demo pipeline (Demo) — inbound prospects moving through the signing funnel.
// Pure — safe to import on server or client.

export const DEMO_STAGES = ["received", "reviewing", "offer", "releasing", "passed"] as const;
export type DemoStage = (typeof DEMO_STAGES)[number];

export const DEMO_STAGE_LABELS: Record<DemoStage, string> = {
  received: "Received",
  reviewing: "Reviewing",
  offer: "Offer made",
  releasing: "Signed / releasing",
  passed: "Passed",
};

export type DemoInput = {
  artistName: string;
  contactName: string | null;
  contactEmail: string | null;
  link: string | null;
  genre: string | null;
  source: string | null;
  stage: DemoStage;
  rating: number;
  notes: string | null;
};

export function isDemoStage(v: unknown): v is DemoStage {
  return typeof v === "string" && (DEMO_STAGES as readonly string[]).includes(v);
}

export function normalizeRating(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(5, Math.max(0, Math.round(n)));
}

export const demoStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** A demo link — only http(s) URLs, so a stored value can't become a
 *  javascript:/data: href when rendered. Non-http(s) input is dropped. */
export function safeUrl(v: unknown): string | null {
  const s = demoStr(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : null;
}

/** Clean a full create/update body into stored fields (artistName "" if missing). */
export function normalizeDemoInput(body: unknown): DemoInput {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return {
    artistName: demoStr(o.artistName, 200) ?? "",
    contactName: demoStr(o.contactName, 200),
    contactEmail: demoStr(o.contactEmail, 320),
    link: safeUrl(o.link),
    genre: demoStr(o.genre, 80),
    source: demoStr(o.source, 120),
    stage: isDemoStage(o.stage) ? o.stage : "received",
    rating: normalizeRating(o.rating),
    notes: demoStr(o.notes, 2000),
  };
}
