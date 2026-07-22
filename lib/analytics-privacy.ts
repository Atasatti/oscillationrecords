import { createHmac, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import type { JWT } from "next-auth/jwt";
import { requirePermission } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";

/**
 * Two tiers of analytics.
 *
 * `analytics:read` — what every staff role holds — used to return identifiable
 * activity: listener names and email addresses, per-play rows tied to a named
 * member, the newest signups with their emails, and live sessions labelled with
 * whoever was browsing. A catalogue editor or a read-only viewer needs play
 * counts and trends; none of them need to know that a named person listened to a
 * particular track from a particular city at 14:32.
 *
 * `analytics:pii` is the narrow permission that unlocks the identifiable view.
 * No scoped role holds it — only owners, via their blanket "*" grant. Everyone
 * else gets the same numbers with identities replaced by stable pseudonyms.
 *
 * The split is per-FIELD, not per-endpoint: the aggregate parts of every
 * analytics response (totals, trends, top content, country and city *counts*)
 * are unchanged for all roles. Only the rows that name an individual change.
 */

/** Salt for the pseudonym HMAC. NEXTAUTH_SECRET is already a deployment secret
 *  and is never shipped to a client, so pseudonyms are stable across requests
 *  and processes but can't be reversed by anyone holding only the output. If it
 *  is somehow absent, fall back to a per-process random salt — pseudonyms then
 *  stop being stable across restarts, which degrades the analytics rather than
 *  the privacy. */
const PSEUDONYM_SALT = process.env.NEXTAUTH_SECRET || randomBytes(32).toString("hex");

/**
 * A stable, non-reversible label for one listener or session.
 *
 * Deterministic, so a viewer can still tell that the same person came back
 * twice — which is what makes returning-listener and session metrics work —
 * without learning who they are. Truncated to 8 hex characters: enough to keep
 * collisions negligible at this scale, short enough to read in a table.
 */
export function pseudonymize(
  id: string | null | undefined,
  label = "Listener"
): string {
  if (!id) return "Anonymous";
  const digest = createHmac("sha256", PSEUDONYM_SALT).update(id).digest("hex").slice(0, 8);
  return `${label} ${digest}`;
}

/**
 * May this request see identifiable analytics? Boolean rather than a Guard: a
 * caller without it isn't refused, they get the pseudonymized view — so the
 * dashboards keep working for every role instead of 403-ing.
 */
export async function canReadAnalyticsPii(request: NextRequest): Promise<boolean> {
  return (await requirePermission(request, "analytics:pii")).ok;
}

/**
 * Record that identifiable analytics were served, so access to it is reviewable
 * rather than invisible.
 *
 * Throttled to one entry per actor per surface per hour. The live-activity panel
 * polls, so logging every request would bury the audit log in thousands of
 * identical rows and make the retention window meaningless — an audit trail
 * nobody can read is not much better than no audit trail. One row per hour
 * still answers "who was looking at listener identities, and when".
 */
export async function logAnalyticsPiiAccess(
  request: NextRequest,
  token: JWT | null | undefined,
  surface: string
): Promise<void> {
  const actor = typeof token?.email === "string" ? token.email : "unknown";
  if (!rateLimit(`analytics-pii-audit:${actor}:${surface}`, 1, 60 * 60 * 1000).ok) return;
  await recordAudit(request, token, {
    action: "read",
    resource: "analytics",
    resourceId: surface,
    summary: `Viewed identifiable analytics (${surface})`,
    metadata: { surface, permission: "analytics:pii" },
  });
}
