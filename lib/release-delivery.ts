// Release delivery / sign-off workflow — the OPERATIONAL state of getting a
// release out (approved → delivered to the distributor → confirmed live).
// Deliberately distinct from the metadata SEO/completeness score (that measures
// whether the page is discoverable; this measures whether the release shipped).
// Pure — safe on server or client.

export const DELIVERY_STAGES = ["not_started", "ready", "delivered", "live"] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

export const DELIVERY_STAGE_LABELS: Record<DeliveryStage, string> = {
  not_started: "Not started",
  ready: "Ready to deliver",
  delivered: "Delivered to DSPs",
  live: "Live confirmed",
};

/** One-line hint shown under each stage in the stepper. */
export const DELIVERY_STAGE_HINTS: Record<DeliveryStage, string> = {
  not_started: "Not yet queued for delivery",
  ready: "Assets + metadata signed off, ready to send",
  delivered: "Sent to the distributor / DSPs",
  live: "Confirmed live on the stores",
};

export function isDeliveryStage(v: unknown): v is DeliveryStage {
  return typeof v === "string" && (DELIVERY_STAGES as readonly string[]).includes(v);
}

export const deliveryStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export type DeliveryRecord = {
  status: DeliveryStage;
  notes: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};
