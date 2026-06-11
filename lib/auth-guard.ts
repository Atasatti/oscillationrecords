import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";
import { ADMIN_EMAIL } from "@/lib/auth-session";

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

/** True when the request carries a valid session for the single admin account. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = await readToken(req);
  return Boolean(token?.email && token.email === ADMIN_EMAIL);
}

/** Require the admin account. Returns the token, or a ready-to-return error response. */
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
  if (!token?.email || token.email !== ADMIN_EMAIL) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, token };
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
  return Boolean(token?.email && token.email === ADMIN_EMAIL);
}
