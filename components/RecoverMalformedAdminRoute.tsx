"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Safety net for the admin area: if navigation ever lands on an admin URL whose
 * id/slug came through missing — a path with a literal `null` or `undefined`
 * segment, e.g. `/admin/null` or `/admin/releases/null/edit` — recover to the
 * dashboard instead of dead-ending the admin on a 404. Rendered from the global
 * not-found boundary, so it only runs on an already-unmatched route (it never
 * intercepts a valid page). Legitimate admin 404s (a real, wrong path) still show
 * the 404 — only the null/undefined case is bounced.
 */
const MALFORMED_SEGMENT = /^(null|undefined)$/;

export default function RecoverMalformedAdminRoute() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;
    const segments = pathname.split("/").filter(Boolean);
    if (segments[0] === "admin" && segments.some((s) => MALFORMED_SEGMENT.test(s))) {
      router.replace("/admin");
    }
  }, [pathname, router]);

  return null;
}
