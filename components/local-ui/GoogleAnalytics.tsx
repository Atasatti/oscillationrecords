"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
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
 * The App Router navigates without full page reloads, so gtag's automatic
 * page_view is disabled (send_page_view:false) and we send one per route change:
 * the inline init script sends the first view, this component sends every later
 * one. Withdrawing consent flips GA's official `ga-disable-*` kill switch so it
 * stops sending even though the script can't be unloaded mid-session.
 */
export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();
  const initialView = useRef(true);

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
  // longer) granted, even if the library was loaded earlier this session.
  useEffect(() => {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = !active;
  }, [active]);

  // First view is sent by the init script (guaranteed to run after gtag config);
  // this covers every subsequent client-side navigation.
  useEffect(() => {
    if (!active || !pathname) return;
    if (initialView.current) {
      initialView.current = false;
      return;
    }
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
    w.gtag?.("event", "page_view", {
      page_path: pathname + window.location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [active, pathname]);

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
          gtag('config', '${GA_ID}', { send_page_view: false });
          gtag('event', 'page_view', {
            page_path: location.pathname + location.search,
            page_location: location.href,
            page_title: document.title
          });
        `}
      </Script>
    </>
  );
}
