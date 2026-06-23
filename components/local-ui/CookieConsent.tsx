"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readConsentClient, OPEN_CONSENT_EVENT, CONSENT_GRANTED_EVENT } from "@/lib/consent";

/**
 * Opt-in cookie consent banner (UK GDPR / PECR). Shows until the visitor makes a
 * choice. "Accept" enables a first-party anonymous analytics cookie; "Reject"
 * keeps only strictly-necessary (auth) cookies. The choice is stored server-side
 * via /api/consent and mirrored in a readable cookie so the banner stays hidden.
 */
export default function CookieConsent() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Only show once, after mount, if no choice has been recorded yet.
    if (!readConsentClient()) setShow(true);
  }, []);

  useEffect(() => {
    // Let the footer's "Cookies" link reopen the banner to change a prior choice.
    const open = () => setShow(true);
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, []);

  // Consent is for the public site; the signed-in admin workspace doesn't show it.
  if (pathname?.startsWith("/admin")) return null;

  const choose = async (analytics: boolean) => {
    setSaving(true);
    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analytics }),
      });
      // Let trackers start immediately (e.g. record the page they accepted on),
      // rather than waiting for the next navigation.
      if (analytics) window.dispatchEvent(new Event(CONSENT_GRANTED_EVENT));
    } catch {
      /* even on failure, hide — a missing consent cookie just re-prompts later */
    } finally {
      setShow(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-white/10 bg-[#141414]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur sm:flex-row sm:items-center sm:gap-4">
        <p className="flex-1 text-sm text-gray-300">
          We use a strictly-necessary cookie to keep you signed in. With your
          consent we also use analytics cookies — our own and Google Analytics —
          to understand which releases resonate. We never sell your data, and
          nothing non-essential loads unless you accept.{" "}
          <Link href="/privacy" className="underline hover:text-white">
            Privacy policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => choose(false)}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            Reject non-essential
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => choose(true)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
