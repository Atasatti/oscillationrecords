import type { NextRequest } from "next/server";
import type { JWT } from "next-auth/jwt";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Admin audit trail writer.
 *
 * Call `recordAudit(req, token, {...})` AFTER a mutating admin action succeeds.
 * It is best-effort: any failure is logged and swallowed so the audit trail can
 * never break the actual request. Actor identity (id / email / role) comes from
 * the guard token; ip + user-agent come from the request. Read the trail back in
 * the admin "Audit log" view.
 */

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "role.change"
  | "reorder"
  | "bulk";

/**
 * Every `resource` value recordAudit is called with. The audit-log filter dropdown
 * reads this fixed set instead of a `distinct` scan over the (never-evicted,
 * one-row-per-admin-action) AuditLog collection, which grows unbounded (#31). Keep
 * in sync when a new resource type starts being audited.
 */
export const AUDIT_RESOURCES = [
  "artist", "asset", "automation", "campaign", "contact", "content_post",
  "demo", "digest", "error", "message", "pitch", "placement", "press",
  "release", "settings", "studio_booker", "studio_booking", "subscriber", "task", "template", "track", "user",
] as const;

export interface AuditInput {
  /** What happened — an AuditAction, or a custom verb for special cases. */
  action: AuditAction | string;
  /** The kind of thing acted on: "release" | "artist" | "task" | "user" | … */
  resource: string;
  /** Id of the affected record, when there is one. */
  resourceId?: string | null;
  /** Human-readable one-liner, e.g. `Deleted release "Freaky Girl"`. */
  summary: string;
  /** Optional structured context (e.g. { before, after }). Must be JSON-safe. */
  metadata?: unknown;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Best-effort client IP from proxy headers (Vercel/Fastly set these). */
function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

export async function recordAudit(
  req: NextRequest,
  token: JWT | null | undefined,
  input: AuditInput
): Promise<void> {
  try {
    // actorId maps to an ObjectId column — only set it when the token subject
    // actually looks like one, else keep it null (email still identifies them).
    const sub = typeof token?.sub === "string" ? token.sub : null;
    const actorId = sub && OBJECT_ID.test(sub) ? sub : null;

    await prisma.auditLog.create({
      data: {
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        summary: input.summary,
        metadata:
          input.metadata === undefined
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
        actorId,
        actorEmail: typeof token?.email === "string" ? token.email : null,
        actorRole: typeof token?.role === "string" ? token.role : null,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
    });
  } catch (e) {
    console.error("recordAudit failed:", e);
  }
}
