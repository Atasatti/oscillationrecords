import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { ADMIN_EMAILS, isAdminEmail, sessionTokenCookieName } from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Match authOptions.session.maxAge (lib/auth.ts) so the minted cookie behaves like
// a real Google sign-in.
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/**
 * DEV-ONLY localhost login. Mints a NextAuth session cookie for a bootstrap admin
 * so the admin area is reachable without Google OAuth — handy for local work and
 * headless/Playwright automation (no token juggling).
 *
 * Triple-gated so it CANNOT exist in production:
 *   1. 404 unless NODE_ENV !== "production"   (Vercel builds run as production)
 *   2. 404 unless ENABLE_DEV_LOGIN === "1"    (set only in your local .env)
 *   3. 404 unless the request Host is localhost / 127.0.0.1 / [::1]
 *
 * Each gate returns 404 (not 403) so the endpoint is invisible when disabled.
 *
 * Usage:
 *   GET /api/dev/login                                   → primary admin → /admin
 *   GET /api/dev/login?email=<allowlisted>&callbackUrl=/admin/releases
 */
export async function GET(request: NextRequest) {
  // Gates 1 + 2: environment.
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_LOGIN !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }
  // Gate 3: localhost only (Host header, port stripped).
  const host = ((request.headers.get("host") ?? "").split(":")[0] ?? "").toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]") {
    return new NextResponse("Not found", { status: 404 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return new NextResponse("NEXTAUTH_SECRET is not configured", { status: 500 });
  }

  // Choose the admin identity: an explicitly requested email must be on the
  // bootstrap allowlist; otherwise default to the primary admin.
  const requested = request.nextUrl.searchParams.get("email")?.toLowerCase();
  const email = requested && isAdminEmail(requested) ? requested : ADMIN_EMAILS[0];

  // Resolve the real DB id so session.user.id is valid. Best-effort: the admin
  // gate keys off the email, and APIs resolve the user by email regardless.
  let sub = "dev-login";
  let name: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true },
    });
    if (user) {
      sub = user.id;
      name = user.name;
    }
  } catch {
    // ignore — minting still works with email + role for admin gating
  }

  // Mint a session token identical in shape to what the jwt callback produces:
  // email (drives the admin allowlist), role "admin" (owner), sub (session id).
  // No `salt` → NextAuth derives the default session-token key (see jwt/types.d.ts).
  const token = await encode({
    token: { email, name, role: "admin", sub },
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  // Post-login redirect: same-origin path only.
  const rawCb = request.nextUrl.searchParams.get("callbackUrl") ?? "/admin";
  const callbackUrl = rawCb.startsWith("/") && !rawCb.startsWith("//") ? rawCb : "/admin";

  const res = NextResponse.redirect(new URL(callbackUrl, request.url));
  res.cookies.set(sessionTokenCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // dev server is http://localhost
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  console.warn(`[dev-login] Minted admin session for ${email} — DEV ONLY, do not enable in prod`);
  return res;
}
