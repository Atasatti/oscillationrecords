import { Prisma } from "@prisma/client";

// Transient Prisma error codes that are safe to retry for an idempotent write:
//  - P2034: write conflict / deadlock ("Please retry your transaction").
//  - P2028: interactive-transaction timeout — re-running the (idempotent) tx
//    from scratch is safe and usually succeeds when the first run lost a race to
//    remote-DB latency.
const RETRYABLE_CODES = new Set(["P2034", "P2028"]);

/**
 * Run a Prisma write, retrying transient MongoDB write conflicts / deadlocks and
 * interactive-transaction timeouts.
 *
 * Concurrent writers touching the same release / order documents — e.g. the
 * editor's detail save overlapping the tracklist autosave, rapid New Music
 * flag toggles, or a drag-reorder landing while another save is in flight —
 * can collide on MongoDB. These codes are explicitly safe to retry, so we re-run
 * the operation a few times with jittered, growing backoff instead of surfacing
 * a 500. Wrap idempotent writes only (an update/transaction from the same input).
 */
export async function withWriteRetry<T>(
  fn: () => Promise<T>,
  attempts = 7
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof Prisma.PrismaClientKnownRequestError && RETRYABLE_CODES.has(err.code);
      if (!retryable || attempt >= attempts) throw err;
      // Jittered, growing backoff (capped) so colliding writers don't re-collide.
      const delay = Math.min(attempt * 100, 600) + Math.floor(Math.random() * 80);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
