import { Prisma } from "@prisma/client";

/**
 * Run a Prisma write, retrying transient MongoDB write conflicts / deadlocks
 * (error P2034 — "Transaction failed due to a write conflict or a deadlock.
 * Please retry your transaction").
 *
 * Concurrent writers touching the same release / order documents — e.g. the
 * editor's detail save overlapping the tracklist autosave, rapid New Music
 * flag toggles, or a drag-reorder landing while another save is in flight —
 * can collide on MongoDB. P2034 is explicitly safe to retry, so we re-run the
 * operation a few times with a little jittered backoff instead of surfacing a
 * 500. Wrap idempotent writes only (an update/transaction from the same input).
 */
export async function withWriteRetry<T>(
  fn: () => Promise<T>,
  attempts = 5
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!retryable || attempt >= attempts) throw err;
      // Jittered backoff so the colliding writers don't immediately re-collide.
      const delay = attempt * 60 + Math.floor(Math.random() * 50);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
