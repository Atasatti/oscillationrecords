"use client";

import React, { useEffect, useState } from "react";
import { isUsableFileUrl } from "@/lib/asset";

/**
 * Staff/account avatar with every failure mode of a Google profile URL handled.
 *
 * These images are almost always lh3.googleusercontent.com URLs captured at
 * sign-in, and they break in three distinct ways:
 *  1. lh3 403s requests that carry a foreign Referer — the topbar avatar
 *     already shipped referrerPolicy="no-referrer" for exactly this, but the
 *     Staff & roles list never got it (hence its broken icons in production
 *     while dev, with a localhost referrer, looked fine).
 *  2. The next/image optimizer fetches server-side, where Google rate-limits
 *     datacenter IPs. A 32px avatar gains nothing from optimization, so this
 *     renders a plain <img> and removes that moving part entirely (dev never
 *     showed the problem because next.config sets unoptimized in development).
 *  3. The URL simply goes stale (user changes their Google photo). onError
 *     swaps to the initials fallback instead of the browser's broken-image icon.
 *
 * A missing/dirty value ("null", "", relative junk) short-circuits straight to
 * initials via isUsableFileUrl.
 */
export default function StaffAvatar({
  name,
  email,
  image,
  size = 32,
  className = "",
}: {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** Rendered box in px (default 32 — the h-8 w-8 row avatar). */
  size?: number;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  // A changed URL deserves a fresh attempt (e.g. the list refetches after an
  // invite) — don't let one failure stick to a different image.
  useEffect(() => setBroken(false), [image]);

  const src = !broken && isUsableFileUrl(image) ? image : null;
  const initial = (name || email || "?").trim().charAt(0).toUpperCase() || "?";

  if (!src) {
    return (
      <span
        aria-hidden
        style={{ width: size, height: size }}
        className={`flex shrink-0 items-center justify-center rounded-full bg-white/5 text-xs text-muted-foreground ${className}`}
      >
        {initial}
      </span>
    );
  }
  return (
    // Deliberate plain <img>: the optimizer is the failure mode being removed
    // (see the component doc).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
