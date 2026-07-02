import type { NextRequest } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";
import { isStaffRole, type Permission, roleCan } from "@/lib/permissions";

/**
 * Accounts allowed into the admin area (bootstrap allowlist). Add a lowercase
 * email here to grant admin access regardless of the DB `role` field. (Kept in
 * code rather than env so it works in edge middleware.) Role-based grants are
 * handled via the User.role field; see lib/auth-guard.ts.
 */
export const ADMIN_EMAILS: readonly string[] = [
  "oscillationrecordz@gmail.com",
  "tinyminer2015@gmail.com",
];

/** Case-insensitive check for whether an email is a bootstrap admin. */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Token-level OWNER check (no DB): bootstrap email OR a JWT `role` of "admin".
 * "admin" is the owner role (full access). Used by edge middleware (page gating)
 * and read-gating. The authoritative, revocation-aware check for mutations lives
 * in requireAdmin (lib/auth-guard.ts).
 */
export function isAdminToken(token: { email?: string | null; role?: string } | null | undefined): boolean {
  if (!token) return false;
  return token.role === "admin" || isAdminEmail(token.email);
}

/**
 * Token-level STAFF check (no DB): can this token enter the admin area at all?
 * True for owners (bootstrap email or role "admin") OR any scoped staff role
 * (catalog / promotion / analytics / viewer). Used by middleware to admit staff;
 * per-page and per-route permission checks then narrow what they can see/do.
 */
export function isStaffToken(token: { email?: string | null; role?: string } | null | undefined): boolean {
  if (!token) return false;
  return isAdminEmail(token.email) || isStaffRole(token.role);
}

/**
 * Token-level PERMISSION check (no DB): owners (bootstrap or role "admin") get
 * everything; scoped roles are checked against the policy map. Edge/middleware
 * page-gating only — the DB-revocation-aware enforcement is requirePermission.
 */
export function tokenCan(
  token: { email?: string | null; role?: string } | null | undefined,
  perm: Permission
): boolean {
  if (!token) return false;
  if (isAdminToken(token)) return true;
  return roleCan(token.role, perm);
}

/** Must match NextAuth default session cookie names (see next-auth/core/lib/cookie). */
export function sessionTokenCookieName(): string {
  const useSecureCookies =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return useSecureCookies
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

export async function getAuthToken(req: NextRequest): Promise<JWT | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("NEXTAUTH_SECRET is not configured");
    return null;
  }

  return getToken({
    req,
    secret,
    cookieName: sessionTokenCookieName(),
  });
}
