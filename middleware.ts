import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isAdminToken, isStaffToken, tokenCan, getAuthToken } from "@/lib/auth-session";
import type { Permission } from "@/lib/permissions";

// Per-section page gating for /admin, mirroring the sidebar. A path needs either
// "owner" (owner-only), a specific Permission, or null (any staff). Owners always
// pass. This is TOKEN-level (edge, no DB) — eventual-consistency page gating; the
// hard, revocation-aware enforcement is per-route in the API (requirePermission).
function requiredForAdminPath(pathname: string): Permission | "owner" | null {
  if (pathname.startsWith("/admin/settings")) return "owner";
  if (pathname.startsWith("/admin/audit")) return "owner";
  if (pathname.startsWith("/admin/catalog")) return "catalog:read";
  if (pathname.startsWith("/admin/data")) return "analytics:read";
  if (pathname.startsWith("/admin/errors")) return "analytics:read";
  if (pathname.startsWith("/admin/outreach")) return "outreach:read";
  if (pathname.startsWith("/admin/tasks")) return "outreach:read";
  if (pathname.startsWith("/admin/messages")) return "outreach:read";
  if (pathname.startsWith("/admin/subscribers")) return "outreach:read";
  // /admin dashboard (and anything unmapped) → any staff role.
  return null;
}

// ENFORCED in production; REPORT-ONLY in development so it never blocks the dev
// server's HMR (which uses eval). 'unsafe-eval' is added in dev ONLY.
const isDev = process.env.NODE_ENV !== "production";
const cspHeaderKey = isDev
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

/**
 * Build the CSP. Public/most routes keep 'unsafe-inline' for scripts (so SSG/ISR
 * pages and Next's framework inline scripts work). The /admin area gets a strict
 * nonce + 'strict-dynamic' policy (no 'unsafe-inline'), the strongest XSS
 * defense, since that's the highest-value target and those pages are rendered
 * dynamically (see app/admin/layout.tsx `force-dynamic`).
 */
function buildCsp(nonce?: string): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`
    : `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "form-action 'self'",
    "frame-src 'self' https://accounts.google.com",
  ];
  // 'upgrade-insecure-requests' is ignored (and logs a console warning) under a
  // report-only policy, so only emit it when the CSP is actually enforced (prod).
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

// NOTE: the static security headers (X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, Strict-Transport-Security, Permissions-Policy) are set once,
// site-wide, in next.config.ts `headers()` (source "/:path*"). We deliberately do
// NOT duplicate them here — the CSP is the only security header the middleware
// owns, because it needs the per-request admin nonce.

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin routes that require admin access (including benert-remix admin).
  const isAdminRoute =
    pathname.startsWith("/admin") || pathname.startsWith("/benert-remix/admin");
  // Strict nonce CSP is scoped to /admin (whose server layout forces dynamic
  // rendering so the nonce reaches Next's framework scripts).
  const isStrictCspRoute = pathname.startsWith("/admin");

  if (isAdminRoute) {
    const token = await getAuthToken(request);

    // Not authenticated → send to login.
    if (!token) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // The benert-remix admin stays OWNER-only (not part of the scoped-role model).
    if (pathname.startsWith("/benert-remix/admin")) {
      if (!isAdminToken(token)) return NextResponse.redirect(new URL("/", request.url));
    } else {
      // /admin/* : must be staff at all, then must have access to this section.
      if (!isStaffToken(token)) {
        return NextResponse.redirect(new URL("/", request.url));
      }
      const need = requiredForAdminPath(pathname);
      const allowed =
        need === null ? true : need === "owner" ? isAdminToken(token) : tokenCan(token, need);
      // Staff without access to this section → bounce to the dashboard (which any
      // staff role can see), not off the site entirely.
      if (!allowed) {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
    }
  }

  if (isStrictCspRoute) {
    // Strict, nonce-based CSP for the admin area.
    const nonce = btoa(crypto.randomUUID());
    const csp = buildCsp(nonce);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    // Next reads the nonce from the request CSP header and applies it to the
    // scripts it emits.
    requestHeaders.set("content-security-policy", csp);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(cspHeaderKey, csp);
    return response;
  }

  // Everything else (public pages, benert-remix admin, API): relaxed CSP, so
  // static generation and existing inline scripts keep working.
  const response = NextResponse.next();
  response.headers.set(cspHeaderKey, buildCsp());
  return response;
}

export const config = {
  // Run on all routes EXCEPT Next internals and static asset files, so the CSP
  // header is attached to every page/API response without touching static files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|map)$).*)",
  ],
};
