"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  FaBandcamp,
  FaFacebookF,
  FaInstagram,
  FaSoundcloud,
  FaSpotify,
  FaYoutube,
} from "react-icons/fa";
import { SiBeatport } from "react-icons/si";
import { RiTiktokFill } from "react-icons/ri";
import { LuX } from "react-icons/lu";
import type { FooterSocialLinks } from "@/lib/footer-settings";
import { useSession } from "next-auth/react";
import { OPEN_CONSENT_EVENT } from "@/lib/consent";

const EMPTY_LINKS: FooterSocialLinks = {
  xLink: null,
  tiktokLink: null,
  youtubeLink: null,
  instagramLink: null,
  facebookLink: null,
  spotifyLink: null,
  soundcloudLink: null,
  bandcampLink: null,
  beatportLink: null,
};

const Footer = () => {
  const [links, setLinks] = useState<FooterSocialLinks>(EMPTY_LINKS);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const { data: session, status: authStatus } = useSession();
  const signedIn = authStatus === "authenticated" && Boolean(session?.user?.email);
  // null = unknown/not-loaded (and the signed-out state). The checkbox stays
  // unticked by default and only ticks once we confirm the account is subscribed.
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [subBusy, setSubBusy] = useState(false);
  const [subMessage, setSubMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings/footer");
        if (res.ok) {
          const data = (await res.json()) as FooterSocialLinks;
          if (!cancelled) setLinks(data);
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLinksLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const socialItems = [
    { href: links.xLink, Icon: LuX, label: "X" },
    { href: links.tiktokLink, Icon: RiTiktokFill, label: "TikTok" },
    { href: links.youtubeLink, Icon: FaYoutube, label: "YouTube" },
    { href: links.instagramLink, Icon: FaInstagram, label: "Instagram" },
    { href: links.facebookLink, Icon: FaFacebookF, label: "Facebook" },
    { href: links.spotifyLink, Icon: FaSpotify, label: "Spotify" },
    { href: links.soundcloudLink, Icon: FaSoundcloud, label: "SoundCloud" },
    { href: links.bandcampLink, Icon: FaBandcamp, label: "Bandcamp" },
    { href: links.beatportLink, Icon: SiBeatport, label: "Beatport" },
  ].filter(
    (item): item is typeof item & { href: string } => Boolean(item.href?.trim())
  );

  // Load the signed-in user's current subscription so the checkbox reflects it.
  // Signed-out users keep the default unticked (and disabled) checkbox.
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
        /* leave as unknown */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  // Tick = subscribe the account email; untick = unsubscribe it. The email comes
  // from the signed-in session (verified at sign-in) — never typed in here.
  const toggleNewsletter = async (next: boolean) => {
    if (!signedIn || subBusy) return;
    setSubBusy(true);
    setSubMessage(null);
    setSubscribed(next); // optimistic
    try {
      const res = await fetch("/api/newsletter", {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      setSubscribed(Boolean(data.subscribed));
      setSubMessage(
        next ? "You're subscribed — thanks for joining." : "You've been unsubscribed."
      );
    } catch {
      setSubscribed(!next); // revert on failure
      setSubMessage("Something went wrong. Please try again.");
    } finally {
      setSubBusy(false);
    }
  };

  const year = new Date().getFullYear();

  return (
    <div className="border-t border-border pt-10 px-4 sm:px-6 md:px-[10%]">
      <div className="flex flex-col lg:flex-row justify-between gap-10 lg:gap-12">
        <div className="max-w-md">
          <Link
            href="/"
            className="inline-block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            aria-label="Oscillation Records — Home"
          >
            <Image width={80} height={50} alt="" src="/logo-icon.svg" />
            <Image
              width={80}
              height={30}
              alt=""
              src="/logo-name.svg"
              className="mt-2"
            />
          </Link>
          <div className="mt-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={subscribed === true}
                disabled={!signedIn || subBusy || subscribed === null}
                onChange={(e) => toggleNewsletter(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-border bg-background accent-white disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">
                Subscribe to receive updates, new releases, artist news, and
                announcements from Oscillation Records.
              </span>
            </label>
            {authStatus === "unauthenticated" ? (
              <p className="mt-2 text-sm text-muted-foreground">
                <Link href="/login" className="text-foreground underline">
                  Sign in
                </Link>{" "}
                to subscribe with your account email.
              </p>
            ) : subMessage ? (
              <p className="mt-2 text-sm text-muted-foreground">{subMessage}</p>
            ) : null}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">Explore</p>
          <div className="flex flex-wrap items-center gap-6 mt-5 text-sm">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/about" className="hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="/artists" className="hover:text-foreground transition-colors">
              Artists
            </Link>
            <Link href="/releases" className="hover:text-foreground transition-colors">
              Releases
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </div>

      {linksLoaded && socialItems.length > 0 ? (
        <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-8 mt-14">
          {socialItems.map(({ href, Icon, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className="text-muted-foreground hover:text-white transition-colors"
            >
              <Icon className="h-5 w-5" aria-hidden />
            </a>
          ))}
        </div>
      ) : null}

      <div className="border-t border-border mt-10 sm:mt-12 mb-4" />

      <div className="flex flex-col-reverse items-center justify-between gap-3 pb-5 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          © Copyright {year} All Rights Reserved by Oscillation Records.
        </p>
        <div className="flex items-center gap-5 text-xs">
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">
            Privacy
          </Link>
          <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">
            Terms
          </Link>
          <Link href="/account" className="text-muted-foreground hover:text-foreground transition-colors">
            Your data
          </Link>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Cookies
          </button>
        </div>
      </div>
    </div>
  );
};

export default Footer;
