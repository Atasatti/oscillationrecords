import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth-session";
import { roleCan, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Revocation-aware authorization for admin *pages* — React Server Components that
 * read sensitive data directly via Prisma. `middleware.ts` only does a token-level
 * check (it decodes the 30-day JWT, no DB read), so without this a demoted or
 * narrowed staff member's still-valid token would get one last SSR render of PII
 * (subscriber emails, contact-message bodies, …) before the API layer's
 * `requirePermission` would 403 their subsequent calls.
 *
 * Call it at the very top of such a page, before any data fetch, with the SAME
 * permission the page's backing API route uses. It never returns when denied — it
 * redirects: to `/login` when unauthenticated, or to `/admin` when signed in but
 * lacking the permission. Bootstrap owners always pass; the DB role is re-read on
 * every call so demotion/role-change takes effect immediately. Fails closed.
 */
export async function requirePagePermission(permission: Permission): Promise<void> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/login");

  // Bootstrap owners: always allowed, no DB dependency.
  if (isAdminEmail(email)) return;

  // Fresh DB role (not the token's cached role) so demotion/narrowing takes effect
  // now. Any error or missing grant falls through to the redirect (fail closed).
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (user?.role === "admin") return; // owner role
    if (roleCan(user?.role, permission)) return;
  } catch (e) {
    console.error("requirePagePermission: role lookup failed", e);
  }
  redirect("/admin");
}
