import type { NextRequest } from "next/server";
import { getToken, type JWT } from "next-auth/jwt";

/**
 * Accounts allowed into the admin area. Add a lowercase email here to grant
 * admin access. (Kept in code rather than env so it works in edge middleware.)
 */
export const ADMIN_EMAILS: readonly string[] = [
  "oscillationrecordz@gmail.com",
  "tinyminer2015@gmail.com",
];

/** Case-insensitive check for whether an email is an admin. */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Must match NextAuth default session cookie names (see next-auth/core/lib/cookie). */
export function sessionTokenCookieName(): string {
  const useSecureCookies =
    process.env.NEXTAUTH_URL?.startsWith("https://") ?? !!process.env.VERCEL;
  return useSecureCookies
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

export async function getAuthToken(
  req: NextRequest
): Promise<JWT | null> {
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
