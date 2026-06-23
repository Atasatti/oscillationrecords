import type { NextRequest } from "next/server";

/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * NOTE: state lives in the process, so on serverless/multi-instance hosting each
 * instance counts independently — this curbs casual abuse but is not a hard global
 * limit. For production-grade limiting back this with a shared store (e.g. Upstash
 * Redis) keyed the same way.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();
const MAX_TRACKED_KEYS = 10_000;

export type RateLimitResult = { ok: boolean; retryAfter: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now > existing.resetAt) {
    // Opportunistic cleanup so the map can't grow unbounded.
    if (windows.size > MAX_TRACKED_KEYS) {
      for (const [k, w] of windows) {
        if (now > w.resetAt) windows.delete(k);
      }
    }
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

/**
 * Best-effort client IP for rate-limit keying. Prefer `x-real-ip`, which the
 * hosting proxy (Vercel) sets to the true client IP and the client cannot forge
 * through the proxy. Fall back to the left-most `x-forwarded-for` hop only when
 * `x-real-ip` is absent. NOTE: if this app is ever served WITHOUT a trusted
 * proxy that overwrites these headers, a client can spoof them — back the limiter
 * with a shared store + a hardened IP source for production-grade limits.
 */
export function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}
