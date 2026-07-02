// Release "delivery readiness" checklist — is a release complete enough to
// publish / deliver to DSPs? Distinct from the SEO score (lib/seo-score.ts),
// which grades public discoverability. This grades metadata completeness for
// distribution: artwork, tracks, identifiers (UPC/ISRC), a date, a credited
// artist, a genre and streaming links. Pure — safe on server or client.

export interface ReleaseReadinessInput {
  hasCover: boolean;
  trackCount: number;
  /** Tracks with no ISRC set (each track needs one for distribution/royalties). */
  tracksMissingIsrc: number;
  hasUpc: boolean;
  hasReleaseDate: boolean;
  hasPrimaryArtist: boolean;
  hasGenre: boolean;
  /** Count of distinct streaming links set on the release. */
  linkCount: number;
}

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  /** Extra context when not done (e.g. "2 of 5 tracks missing an ISRC"). */
  detail?: string;
}

export interface ReleaseReadinessResult {
  items: ReadinessItem[];
  doneCount: number;
  total: number;
  /** True when every check passes — the release is delivery-ready. */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Persisted delivery / sign-off checklist.
//
// The above readiness is DERIVED (metadata completeness). These steps are the
// human-tracked delivery workflow — ticked manually and stored on the release
// (Release.deliveryChecklist, a { key: boolean } map). The step set lives here so
// the API and UI agree; the release only stores which keys are done. The final
// step ("signedOff") is the publish sign-off gate.
// ---------------------------------------------------------------------------

export const DELIVERY_STEPS = [
  { key: "metadata", label: "Metadata finalised" },
  { key: "artwork", label: "Artwork approved" },
  { key: "delivered", label: "Delivered to distributor" },
  { key: "liveOnDsps", label: "Live on DSPs" },
  { key: "presave", label: "Pre-save / smart link set up" },
  { key: "promo", label: "Promo assets ready" },
  { key: "signedOff", label: "Approved / signed off" },
] as const;

export type DeliveryStepKey = (typeof DELIVERY_STEPS)[number]["key"];
export const DELIVERY_STEP_KEYS: readonly string[] = DELIVERY_STEPS.map((s) => s.key);
export const SIGN_OFF_KEY: DeliveryStepKey = "signedOff";

export interface DeliveryChecklistResult {
  steps: { key: string; label: string; done: boolean }[];
  doneCount: number;
  total: number;
  signedOff: boolean;
}

/** Coerce a stored deliveryChecklist Json into a resolved result over the known steps. */
export function resolveDeliveryChecklist(raw: unknown): DeliveryChecklistResult {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const steps = DELIVERY_STEPS.map((s) => ({ key: s.key, label: s.label, done: obj[s.key] === true }));
  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    total: steps.length,
    signedOff: obj[SIGN_OFF_KEY] === true,
  };
}

export function computeReleaseReadiness(s: ReleaseReadinessInput): ReleaseReadinessResult {
  const items: ReadinessItem[] = [
    { key: "cover", label: "Cover artwork", done: s.hasCover },
    { key: "tracks", label: "At least one track", done: s.trackCount > 0 },
    {
      key: "isrc",
      label: "ISRC on every track",
      done: s.trackCount > 0 && s.tracksMissingIsrc === 0,
      detail:
        s.trackCount === 0
          ? "Add tracks first"
          : s.tracksMissingIsrc > 0
            ? `${s.tracksMissingIsrc} of ${s.trackCount} track${s.trackCount === 1 ? "" : "s"} missing an ISRC`
            : undefined,
    },
    { key: "upc", label: "UPC / barcode", done: s.hasUpc },
    { key: "artist", label: "Primary artist credited", done: s.hasPrimaryArtist },
    { key: "date", label: "Release date set", done: s.hasReleaseDate },
    { key: "genre", label: "Genre set", done: s.hasGenre },
    { key: "links", label: "Streaming links", done: s.linkCount > 0 },
  ];

  const doneCount = items.filter((i) => i.done).length;
  return { items, doneCount, total: items.length, ready: doneCount === items.length };
}
