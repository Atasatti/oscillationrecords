import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import crypto from "node:crypto";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { recordError } from "@/lib/error-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Trusted "server" ingest requires a DEDICATED secret (ERROR_LOG_INGEST_SECRET) —
 * we deliberately do NOT fall back to NEXTAUTH_SECRET: that would put the session-
 * signing secret in a plaintext request header (proxy/CDN/APM logs) and a leak
 * would let an attacker forge admin sessions. With no dedicated secret configured,
 * nothing is trusted and every report is rate-limited as a client. The comparison
 * is constant-time to avoid a timing oracle on the secret.
 */
function isTrustedIngest(request: NextRequest): boolean {
  const secret = process.env.ERROR_LOG_INGEST_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-error-source");
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /api/error-log — error ingest.
//   • Client errors: posted by the browser ErrorLogger (public, rate-limited).
//   • Server errors: posted by instrumentation.ts with the x-error-source secret
//     header, which is trusted to set source="server" and bypasses the per-IP
//     limit (a client can't spoof "server" without the secret).
export async function POST(request: NextRequest) {
  const trusted = isTrustedIngest(request);

  if (!trusted) {
    const rl = rateLimit(`errlog:${clientIp(request)}`, 30, 60_000);
    if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => null);
    const message = body?.message;
    if (!message || typeof message !== "string") {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const source = trusted && body?.source === "server" ? "server" : "client";

    // For client reports, attribute to the signed-in user when possible.
    let userEmail: string | null = null;
    if (source === "client" && process.env.NEXTAUTH_SECRET) {
      try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        userEmail = (token?.email as string) ?? null;
      } catch {
        /* ignore */
      }
    }

    await recordError({
      source,
      level: body?.level === "warn" ? "warn" : "error",
      message,
      stack: typeof body?.stack === "string" ? body.stack : null,
      path: typeof body?.path === "string" ? body.path : null,
      method: typeof body?.method === "string" ? body.method : null,
      statusCode: typeof body?.statusCode === "number" ? body.statusCode : null,
      digest: typeof body?.digest === "string" ? body.digest : null,
      userEmail,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("error-log ingest failed:", error);
    return NextResponse.json({ ok: false });
  }
}
