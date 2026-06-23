"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readConsentClient, CONSENT_GRANTED_EVENT } from "@/lib/consent";

/** GA4 Measurement ID. Not secret — it ships in the page source either way. */
const GA_ID = "G-7P0PX30X8B";

/**
 * Google Analytics (GA4), loaded ONLY after the visitor grants analytics consent
 * — the same gate as our first-party trackers (PageViewTracker, play beacons).
 * Until "Accept" is clicked there is no gtag script, no Google cookies, and no
 * network requests. The /admin workspace is excluded.
 *
 * Page views — including in-app navigation — are left to GA4 Enhanced
 * Measurement, which is on by default and counts History API route changes, so
 * the App Router's client transitions are tracked without us sending manual
 * page_view events (doing both would double-count). Withdrawing consent flips
 * GA's official `ga-disable-*` kill switch so it stops sending even though the
 * script can't be unloaded mid-session.
 */
export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  // Reflect consent: enabled if already "all", and flip on the instant the
  // visitor clicks Accept (CookieConsent dispatches this) — no reload needed.
  useEffect(() => {
    const sync = () => setEnabled(readConsentClient() === "all");
    sync();
    window.addEventListener(CONSENT_GRANTED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_GRANTED_EVENT, sync);
  }, []);

  const active = enabled && !(pathname?.startsWith("/admin") ?? false);

  // GA's sanctioned opt-out — suppresses all hits when consent isn't (or is no
  // longer) granted, and on /admin, even if the library loaded earlier.
  useEffect(() => {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !active;
  }, [active]);

  if (!active) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
