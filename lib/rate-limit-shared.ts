import { prisma } from "@/lib/prisma";
import { rateLimit as processLocalRateLimit } from "@/lib/rate-limit";

/**
 * Cross-instance rate limiting, backed by MongoDB. The in-memory limiter
 * (lib/rate-limit.ts) is process-local: on serverless, each instance keeps its
 * own counters, so a burst spread across instances (or straddling a deploy)
 * multiplies the effective limit. That's tolerable for the high-volume
 * analytics beacons (where a DB write per event would cost more than the abuse
 * it prevents) but not for the PRESIGN endpoints, where each allowed request
 * mints a signed upload capability — those use this.
 *
 * One document per key in the raw `RateLimitWindow` collection (not a Prisma
 * model — like the pageMedia blob, it needs no schema migration; `_id` IS the
 * key, so no extra index is needed). A single findAndModify with an
 * aggregation-pipeline update makes read-reset-increment atomic: concurrent
 * requests on different instances serialize on the document.
 *
 * Failure posture: if the database can't be reached, fall back to the
 * process-local limiter — degraded (per-instance) enforcement rather than
 * either failing open or taking uploads down with the limiter.
 */

const COLLECTION = "RateLimitWindow";

type FindAndModifyResult = { value?: { count?: number; windowStart?: number } | null };

export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean }> {
  const now = Date.now();
  const windowFloor = now - windowMs;

  // Atomic: reset the window if it has lapsed (or never existed), else increment.
  const update = [
    {
      $set: {
        windowStart: {
          $cond: [{ $lt: [{ $ifNull: ["$windowStart", 0] }, windowFloor] }, now, "$windowStart"],
        },
        count: {
          $cond: [
            { $lt: [{ $ifNull: ["$windowStart", 0] }, windowFloor] },
            1,
            { $add: [{ $ifNull: ["$count", 0] }, 1] },
          ],
        },
      },
    },
  ];

  // Two attempts: a concurrent first-use of the same key can race the upsert
  // into a duplicate-_id error; the retry then finds the document and increments.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = (await prisma.$runCommandRaw({
        findAndModify: COLLECTION,
        query: { _id: key },
        update,
        upsert: true,
        new: true,
      })) as unknown as FindAndModifyResult;

      const count = typeof res?.value?.count === "number" ? res.value.count : 1;

      // Opportunistic purge so dead keys (per-IP contact uploads churn) can't
      // grow the collection without bound. Cheap, rare, best-effort.
      if (Math.random() < 0.02) {
        void prisma
          .$runCommandRaw({
            delete: COLLECTION,
            deletes: [{ q: { windowStart: { $lt: now - 24 * 60 * 60 * 1000 } }, limit: 0 }],
          })
          .catch(() => {});
      }

      return { ok: count <= limit };
    } catch (e) {
      if (attempt === 0) continue; // upsert race — retry once
      console.error("rateLimitShared: falling back to process-local limiter", e);
    }
  }
  return processLocalRateLimit(key, limit, windowMs);
}
