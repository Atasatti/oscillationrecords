"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { readConsentClient } from "@/lib/consent";

/**
 * Fires a consented page-view beacon on each public route change (and first load).
 * Reads window.location.search directly (no useSearchParams → no Suspense needed).
 * Skips the admin area and only runs with analytics consent.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin")) return;
    if (last.current === pathname) return;
    last.current = pathname;
    if (readConsentClient() !== "all") return;

    const body = JSON.stringify({
      path: pathname,
      search: window.location.search,
      referrer: document.referrer || null,
    });
    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
