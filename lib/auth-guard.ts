import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";
import { isAdminEmail, isAdminToken } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

/**
 * Server-side authorization helpers for API route handlers.
 *
 * Middleware (`middleware.ts`) only guards admin *pages*, never `/api/*`, so every
 * mutating/sensitive route must call one of these at the top of the handler.
 */

export type Guard =
  | { ok: true; token: JWT }
  | { ok: false; response: NextResponse };

async function readToken(req: NextRequest): Promise<JWT | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return getToken({ req, secret });
}

/**
 * True when the request is admin (bootstrap email OR JWT role==="admin").
 * Token-level only (no DB) — used for read-gating (e.g. revealing private fields).
 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = await readToken(req);
  return isAdminToken(token);
}

/**
 * Authoritative admin check for mutations. Bootstrap-allowlisted emails are
 * always admin. Role-granted admins are re-verified against the DB on every call
 * so that demoting a user (role → "user") revokes access on their next request,
 * even while their JWT still says "admin". Returns the token, or an error response.
 */
export async function requireAdmin(req: NextRequest): Promise<Guard> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      ),
    };
  }
  const token = await getToken({ req, secret });
  const forbidden: Guard = {
    ok: false,
    response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  };
  if (!token?.email) return forbidden;

  // Bootstrap admins: always allowed, no DB hit.
  if (isAdminEmail(token.email)) return { ok: true, token };

  // Role-granted admins: confirm the current DB role (revocation-aware). Fail
  // closed if the DB can't be read.
  if (token.role === "admin") {
    try {
      const user = await prisma.user.findUnique({
        where: { email: token.email as string },
        select: { role: true },
      });
      if (user?.role === "admin") return { ok: true, token };
    } catch (e) {
      console.error("requireAdmin: role lookup failed", e);
    }
  }
  return forbidden;
}

/** Require any authenticated user. Returns the token, or a ready-to-return error response. */
export async function requireUser(req: NextRequest): Promise<Guard> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      ),
    };
  }
  const token = await getToken({ req, secret });
  if (!token?.sub || !token?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, token };
}

export function tokenIsAdmin(token: JWT | null | undefined): boolean {
  return isAdminToken(token);
}
