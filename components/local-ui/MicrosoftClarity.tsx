"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readConsentClient, CONSENT_CHANGED_EVENT } from "@/lib/consent";

/** Microsoft Clarity project id. Not secret — it ships in the page source either way. */
const CLARITY_ID = "xcmtwumsbi";

/**
 * Microsoft Clarity (heatmaps + session replay), loaded ONLY after the visitor
 * grants analytics consent — the same gate as GoogleAnalytics and our first-party
 * trackers (PageViewTracker, play beacons). Until "Accept" is clicked there is no
 * Clarity script, no cookies and no network requests.
 *
 * Excluded from /admin: there's no value in recording the back-office, and it
 * renders subscriber/analytics PII we shouldn't ship to a session-replay service.
 * Withdrawing consent (or navigating into /admin) calls clarity('stop') — the
 * script can't be unloaded mid-session, but this halts further capture.
 */
export default function MicrosoftClarity() {
  const [enabled, setEnabled] = useState(false);
  const pathname = usePathname();

  // Reflect consent live: enabled only while the choice is "all". Re-checks on
  // every consent change (accept OR reject), so withdrawal calls clarity('stop')
  // in the same session — no reload needed.
  useEffect(() => {
    const sync = () => setEnabled(readConsentClient() === "all");
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, []);

  const active = enabled && !(pathname?.startsWith("/admin") ?? false);

  // Halt capture when consent isn't (or is no longer) granted, or on /admin — even
  // if the library already loaded earlier in the session.
  useEffect(() => {
    if (!active) {
      const w = window as unknown as { clarity?: (command: string) => void };
      if (typeof w.clarity === "function") w.clarity("stop");
    }
  }, [active]);

  if (!active) return null;

  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${CLARITY_ID}");`}
    </Script>
  );
}
