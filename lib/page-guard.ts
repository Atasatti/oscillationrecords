import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/auth-session";
import { isStaffRole, roleCan, type Permission } from "@/lib/permissions";
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

/**
 * Revocation-aware "is this account still staff?" for admin pages that middleware
 * admits on staff-membership alone (no specific permission). Same reasoning as
 * requirePagePermission: middleware reads the 30-day JWT's cached role, so
 * without this a demoted account gets one last server render of internal data.
 *
 * Use for pages with no narrower permission of their own; anything mapped to a
 * Permission in middleware.ts should use requirePagePermission with that
 * permission instead, so the page and its API agree. Fails closed.
 */
export async function requirePageStaff(): Promise<void> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/login");

  if (isAdminEmail(email)) return;

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (isStaffRole(user?.role)) return;
  } catch (e) {
    console.error("requirePageStaff: role lookup failed", e);
  }
  redirect("/");
}

/**
 * Owner-only page gate (bootstrap email or DB role "admin"). Redirects to /login
 * when unauthenticated, or /admin when signed in but not an owner. Fails closed.
 */
export async function requirePageOwner(): Promise<void> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/login");
  if (isAdminEmail(email)) return;
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { role: true } });
    if (user?.role === "admin") return;
  } catch (e) {
    console.error("requirePageOwner: role lookup failed", e);
  }
  redirect("/admin");
}

/**
 * Studio booker page access. Redirects unauthenticated visitors to the login
 * page (returning to /studio). Returns "ok" for owners and allowlisted emails,
 * "denied" otherwise — so the page can render a friendly access screen rather
 * than redirect. Fails closed (a DB error → "denied").
 */
export async function studioPageAccess(): Promise<"ok" | "denied"> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/login?callbackUrl=/studio");
  if (isAdminEmail(email)) return "ok";
  try {
    const [user, booker] = await Promise.all([
      prisma.user.findUnique({ where: { email }, select: { role: true } }),
      prisma.studioBooker.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } }),
    ]);
    if (user?.role === "admin" || booker) return "ok";
  } catch (e) {
    console.error("studioPageAccess: lookup failed", e);
  }
  return "denied";
}
