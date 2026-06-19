"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { readConsentClient, CONSENT_GRANTED_EVENT } from "@/lib/consent";

/**
 * Fires a consented page-view beacon on each public route change (and first load),
 * and immediately when consent is granted (so the landing page where the visitor
 * accepts is counted). Reads window.location.search directly (no useSearchParams →
 * no Suspense needed). Skips the admin area and only runs with analytics consent.
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    const send = () => {
      if (!pathname || pathname.startsWith("/admin")) return;
      if (readConsentClient() !== "all") return;
      if (last.current === pathname) return;
      last.current = pathname;
      fetch("/api/analytics/pageview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          search: window.location.search,
          referrer: document.referrer || null,
        }),
        keepalive: true,
      }).catch(() => {});
    };

    send();
    // When the visitor accepts cookies, count the page they're on right now.
    window.addEventListener(CONSENT_GRANTED_EVENT, send);
    return () => window.removeEventListener(CONSENT_GRANTED_EVENT, send);
  }, [pathname]);

  return null;
}
