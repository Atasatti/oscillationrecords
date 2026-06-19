"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

const FULL_LABEL =
  "Subscribe to receive updates, new releases, artist news, and announcements from Oscillation Records.";

/**
 * Account-email newsletter checkbox, shared by the footer (compact) and the
 * account settings page (full). Reflects the signed-in user's current
 * subscription and toggles it via /api/newsletter (POST = subscribe, DELETE =
 * unsubscribe). Never takes a typed email. Signed-out users see a subtle
 * sign-in prompt instead of an interactive box.
 */
export default function NewsletterToggle({ compact = false }: { compact?: boolean }) {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated" && Boolean(session?.user?.email);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setSubscribed(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/newsletter");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setSubscribed(Boolean(data.subscribed));
        }
      } catch {
        /* leave unknown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const toggle = async (next: boolean) => {
    if (!signedIn || busy) return;
    setBusy(true);
    setMessage(null);
    setSubscribed(next); // optimistic
    try {
      const res = await fetch("/api/newsletter", { method: next ? "POST" : "DELETE" });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      setSubscribed(Boolean(data.subscribed));
      setMessage(next ? "Subscribed — thanks for joining." : "You've been unsubscribed.");
    } catch {
      setSubscribed(!next); // revert
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const textSize = compact ? "text-xs" : "text-sm";
  const boxSize = compact ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={subscribed === true}
          disabled={!signedIn || busy || subscribed === null}
          onChange={(e) => toggle(e.target.checked)}
          className={`mt-0.5 ${boxSize} shrink-0 rounded border border-border bg-background accent-white disabled:cursor-not-allowed disabled:opacity-50`}
        />
        <span className={`${textSize} text-muted-foreground`}>
          {compact ? "Subscribe to our newsletter" : FULL_LABEL}
        </span>
      </label>
      {signedIn ? (
        message ? <p className={`mt-1.5 ${textSize} text-muted-foreground`}>{message}</p> : null
      ) : (
        <p className={`mt-1.5 ${textSize} text-muted-foreground`}>
          <Link href="/login" className="text-foreground underline">
            Sign in
          </Link>{" "}
          to subscribe.
        </p>
      )}
    </div>
  );
}
