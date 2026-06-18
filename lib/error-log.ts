import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Site-wide error recording. Errors (server + client) are de-duplicated by a
 * fingerprint and counted, so the table tracks distinct issues with occurrence
 * counts rather than an unbounded raw log. recordError NEVER throws — error
 * logging must not cascade into more errors.
 */

export type ErrorSource = "server" | "client";
export type ErrorLevel = "error" | "warn";

export interface RecordErrorInput {
  level?: ErrorLevel;
  source: ErrorSource;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  digest?: string | null;
  userEmail?: string | null;
  userAgent?: string | null;
}

// Cap on DISTINCT fingerprints so a flood of unique messages can't grow the
// collection without bound (recurring errors just bump an existing row's count).
const MAX_DISTINCT = 2000;

/** Collapse volatile bits (ids, numbers, hex) so similar errors share a fingerprint. */
function normalizeMessage(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/0x[0-9a-f]+/g, "#")
    .replace(/\b[0-9a-f]{8,}\b/g, "#") // ObjectIds, hashes, uuids
    .replace(/\d+/g, "#")
    .slice(0, 300);
}

function computeFingerprint(i: RecordErrorInput, message: string): string {
  const basis = [i.source, i.level ?? "error", normalizeMessage(message), i.path ?? ""].join("|");
  return createHash("sha1").update(basis).digest("hex");
}

export async function recordError(input: RecordErrorInput): Promise<void> {
  try {
    const message = String(input.message || "Unknown error").slice(0, 2000);
    const fingerprint = computeFingerprint(input, message);
    const sample = {
      level: input.level ?? "error",
      source: input.source,
      message,
      stack: input.stack ? String(input.stack).slice(0, 8000) : null,
      path: input.path ? String(input.path).slice(0, 500) : null,
      method: input.method ? String(input.method).slice(0, 16) : null,
      statusCode: typeof input.statusCode === "number" ? input.statusCode : null,
      digest: input.digest ? String(input.digest).slice(0, 200) : null,
      userEmail: input.userEmail ? String(input.userEmail).slice(0, 320) : null,
      userAgent: input.userAgent ? String(input.userAgent).slice(0, 500) : null,
    };

    const incrementData = {
      ...sample,
      count: { increment: 1 },
      lastSeen: new Date(),
      resolved: false, // a recurrence re-opens a resolved error
    };

    // Increment if the fingerprint already exists; create otherwise.
    // findUnique first so update is never called on a missing row (avoids Prisma
    // logging the expected P2025 to stderr). The create path still catches P2002
    // for the rare case of a concurrent identical error winning the race.
    const existing = await prisma.errorLog.findUnique({
      where: { fingerprint },
      select: { id: true },
    });

    if (existing) {
      await prisma.errorLog.update({ where: { fingerprint }, data: incrementData });
      return;
    }

    const distinct = await prisma.errorLog.count();
    if (distinct >= MAX_DISTINCT) return; // soft cap on distinct fingerprints

    try {
      await prisma.errorLog.create({ data: { ...sample, fingerprint } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        // Lost the create race to a concurrent identical error → bump it.
        await prisma.errorLog.update({ where: { fingerprint }, data: incrementData });
        return;
      }
      throw e;
    }
  } catch (e) {
    // Swallow — never let logging an error throw into the caller.
    console.error("recordError failed:", e);
  }
}
