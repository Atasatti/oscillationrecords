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
  // Fail CLOSED if decoding throws. next-auth's getToken inspects the request's
  // Authorization header, and a malformed `Bearer` value made it throw an
  // uncaught exception (GHSA advisory, patched in next-auth 4.24.15). A throw
  // here must never surface as a 500 that leaks a stack or, worse, be mistaken
  // for an authenticated path — treat any decode failure as "no token", which
  // the callers below turn into a 401/403. Kept as defence-in-depth beyond the
  // dependency patch: no attacker-supplied header can crash a guarded route.
  try {
    return { token: await getToken({ req, secret }) };
  } catch (e) {
    console.error("resolveToken: getToken threw; treating as unauthenticated", e);
    return { token: null };
  }
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

export type UserGuard =
  | { ok: true; token: JWT; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Require an authenticated user who STILL EXISTS in the database.
 *
 * Sessions are stateless 30-day JWTs, so deleting an account can't invalidate
 * the tokens already issued for it — the same person's other browsers and
 * devices keep holding a perfectly well-signed token. Checking the token alone
 * therefore let a deleted account go on using authenticated endpoints for up to
 * a month. Confirming the user row exists is what makes erasure take effect on
 * the very next request, everywhere, without a session store.
 *
 * Also returns the caller's real Mongo `User.id` (token.sub is the Google OAuth
 * subject), since the lookup has already been done — callers shouldn't re-query
 * via resolveUserId().
 *
 * Fails closed: a missing user is 401, an unreadable database is 503.
 */
export async function requireUser(req: NextRequest): Promise<UserGuard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  // Unauthenticated is 401 here (not the guards' 403) — preserve that.
  if (!token?.sub || !token?.email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let user: { id: string } | null;
  try {
    user = await prisma.user.findUnique({
      where: { email: token.email as string },
      select: { id: true },
    });
  } catch (e) {
    console.error("requireUser: account lookup failed", e);
    return {
      ok: false,
      response: NextResponse.json({ error: "Service unavailable" }, { status: 503 }),
    };
  }
  if (!user) {
    // The account was deleted (or never synced) while this token stayed valid.
    return {
      ok: false,
      response: NextResponse.json({ error: "Account no longer exists" }, { status: 401 }),
    };
  }
  return { ok: true, token, userId: user.id };
}

/**
 * Authoritative STUDIO-BOOKING access check. Owners (bootstrap email or DB role
 * "admin") always pass. Everyone else must have their email on the StudioBooker
 * allowlist — read fresh from the DB on every call, so adding/removing a booker
 * takes effect on their next request. Fails closed if the DB can't be read.
 */
export async function requireStudioAccess(req: NextRequest): Promise<Guard> {
  const resolved = await resolveToken(req);
  if ("response" in resolved) return { ok: false, response: resolved.response };
  const token = resolved.token;
  if (!token?.email) return forbidden();
  if (await tokenIsOwner(token)) return { ok: true, token };
  try {
    const booker = await prisma.studioBooker.findUnique({
      where: { email: (token.email as string).toLowerCase() },
      select: { id: true },
    });
    if (booker) return { ok: true, token };
  } catch (e) {
    console.error("requireStudioAccess: allowlist lookup failed", e);
  }
  return forbidden();
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
