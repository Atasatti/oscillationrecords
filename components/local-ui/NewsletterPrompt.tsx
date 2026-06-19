"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * One-time newsletter prompt shown right after a new account is created. The
 * brand-new account is flagged server-side at sign-in (lib/auth.ts); this asks
 * once, records the answer (clearing the flag), and never reappears. Dismissing
 * counts as "Not now". Lives in the root layout so it works wherever signup
 * lands the user.
 */
export default function NewsletterPrompt() {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const answeredRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    // Only hit the endpoint once per browser session.
    if (typeof window !== "undefined" && sessionStorage.getItem("osc_nl_prompt_seen")) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/newsletter-prompt");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.prompt === true) setOpen(true);
      } catch {
        /* ignore — prompt is best-effort */
      } finally {
        try {
          sessionStorage.setItem("osc_nl_prompt_seen", "1");
        } catch {
          /* sessionStorage unavailable — fine */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const answer = async (subscribe: boolean) => {
    // Closing the dialog re-fires onOpenChange; guard so we only POST once.
    if (answeredRef.current) {
      setOpen(false);
      return;
    }
    answeredRef.current = true;
    setBusy(true);
    try {
      await fetch("/api/account/newsletter-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribe }),
      });
    } catch {
      /* best-effort */
    }
    setBusy(false);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) answer(false);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stay in the loop?</DialogTitle>
          <DialogDescription>
            Subscribe to receive updates, new releases, artist news, and
            announcements from Oscillation Records. You can change this any time in
            your{" "}
            <Link href="/account" className="underline">
              account settings
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)} disabled={busy}>
            Not now
          </Button>
          <Button onClick={() => answer(true)} disabled={busy}>
            Subscribe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
