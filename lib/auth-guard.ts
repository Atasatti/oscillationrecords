import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";
import { isAdminEmail, isAdminToken } from "@/lib/auth-session";
import { isStaffRole, roleCan, type Permission } from "@/lib/permissions";
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

/** The shared 403 response every role/permission guard returns on denial. */
function forbidden(): Guard {
  return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

/**
 * Decode the JWT once, distinguishing a server misconfiguration (missing secret →
 * 500) from a normal decode (which may still yield a null/anonymous token). The
 * single place the four guards below get their token + config-error response, so a
 * change to token handling can't drift across them.
 */
async function resolveToken(
  req: NextRequest
): Promise<{ token: JWT | null } | { response: NextResponse }> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return { response: NextResponse.json({ error: "Server configuration error" }, { status: 500 }) };
  }
  return { token: await getToken({ req, secret }) };
}

async function readToken(req: NextRequest): Promise<JWT | null> {
  const resolved = await resolveToken(req);
  return "response" in resolved ? null : resolved.token;
}

/**
 * Authoritative owner check for a decoded token. Bootstrap-allowlisted emails are
 * always owners (no DB dependency). A token whose `role` claim says "admin" is
 * re-verified against the CURRENT database role, because the role is written into
 * the JWT at sign-in and never refreshed — a 30-day session keeps asserting
 * "admin" long after the account was demoted. Fails closed if the DB can't be
 * read. The single definition behind requireAdmin and isAdminRequest.
 */
async function tokenIsOwner(token: JWT | null): Promise<boolean> {
  if (!token?.email) return false;
  if (isAdminEmail(token.email)) return true;
  // Only a token *claiming* admin costs a lookup — anonymous and ordinary
  // visitors (the overwhelming majority of catalog GETs) never touch the DB.
  if (!isAdminToken(token)) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { email: token.email as string },
      select: { role: true },
    });
    return user?.role === "admin";
  } catch (e) {
    console.error("tokenIsOwner: role lookup failed", e);
    return false;
  }
}

/**
 * True when the request is currently an owner. Read-gate for private catalogue
 * fields — draft/unreleased records, UPC / catalogue number / P-line / C-line,
 * and the internal track fields (ISRC, ISWC, stems, splits, synced lyrics).
 *
 * Revocation-aware: this used to answer from the JWT alone, so a demoted owner
 * kept reading private catalogue data through GET endpoints until their 30-day
 * token expired, even though every mutation was already refused. It now re-reads
 * the role, on the same terms as requireAdmin — the read side and the write side
 * can no longer disagree about who is an admin.
 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  return tokenIsOwner(await readToken(req));
}

/**
 * Authoritative admin check for mutations. Bootstrap-allowlisted emails are
 * always admin. Role-granted admins are re-verified against the DB on every call
 * so that demoting a user (role → "user") revokes access on their next request,
 * even while their JWT still says "admin". Returns the token, or an error response.
 */
export async function requireAdmin(req: NextRequest): Promise<Guard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  if (!token?.email) return forbidden();
  return (await tokenIsOwner(token)) ? { ok: true, token } : forbidden();
}

/**
 * Authoritative STAFF check — admits anyone who can enter the admin area at all
 * (owner OR any scoped role). Bootstrap emails pass instantly; role-granted staff
 * are re-verified against the current DB role (so demotion revokes on the next
 * request). Use for admin reads/dashboards that any staff role may view. Fails
 * closed if the DB can't be read.
 */
export async function requireStaff(req: NextRequest): Promise<Guard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  if (!token?.email) return forbidden();

  // Owners (bootstrap email): always allowed, no DB hit.
  if (isAdminEmail(token.email)) return { ok: true, token };

  // Role-granted staff: confirm the CURRENT DB role is still a staff role.
  if (isStaffRole(token.role)) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: token.email as string },
        select: { role: true },
      });
      if (isStaffRole(user?.role)) return { ok: true, token };
    } catch (e) {
      console.error("requireStaff: role lookup failed", e);
    }
  }
  return forbidden();
}

/**
 * Authoritative PERMISSION check for scoped access. Owners (bootstrap email or
 * DB role "admin") get every permission. Other staff are checked against the
 * CURRENT DB role (revocation- and role-change-aware) via the policy map in
 * lib/permissions.ts. Fails closed if the DB can't be read.
 *
 * Backwards compatible: every existing admin is an owner, so they pass every
 * permission unchanged.
 */
export async function requirePermission(req: NextRequest, permission: Permission): Promise<Guard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  if (!token?.email) return forbidden();

  // Owners (bootstrap email): full access, no DB hit.
  if (isAdminEmail(token.email)) return { ok: true, token };

  // Any staff role in the token → re-read the CURRENT role from the DB and check
  // the fresh role against the policy (so demotion/role-change takes effect now).
  if (isStaffRole(token.role)) {
    try {
      const user = await prisma.user.findUnique({
        where: { email: token.email as string },
        select: { role: true },
      });
      if (user?.role === "admin") return { ok: true, token }; // owner
      if (roleCan(user?.role, permission)) return { ok: true, token };
    } catch (e) {
      console.error("requirePermission: role lookup failed", e);
    }
  }
  return forbidden();
}

/** Require any authenticated user. Returns the token, or a ready-to-return error response. */
export async function requireUser(req: NextRequest): Promise<Guard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  // Unauthenticated is 401 here (not the guards' 403) — preserve that.
  if (!token?.sub || !token?.email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true, token };
}

/**
 * Defense-in-depth CSRF check for destructive, cookie-authenticated routes.
 * Same-origin browser requests always send an `Origin` header on state-changing
 * methods (POST/PUT/PATCH/DELETE), so a request whose `Origin` is present but
 * doesn't match the `Host` is rejected. An absent `Origin` (same-origin GET or a
 * server-to-server caller) is allowed so non-browser clients aren't broken. This
 * complements the session cookie's SameSite=lax attribute.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
