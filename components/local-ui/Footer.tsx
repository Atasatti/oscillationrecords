"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — must stay empty
  const [subStatus, setSubStatus] = useState<
    "idle" | "loading" | "ok" | "err"
  >("idle");
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

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubMessage(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setSubStatus("err");
      setSubMessage("Enter your email.");
      return;
    }
    setSubStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, company }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubStatus("err");
        setSubMessage(
          typeof data.error === "string" ? data.error : "Something went wrong."
        );
        return;
      }
      setSubStatus("ok");
      setSubMessage(
        data.created
          ? "Thanks — you're on the list."
          : "You're already subscribed. Thanks for staying in touch."
      );
      setEmail("");
    } catch {
      setSubStatus("err");
      setSubMessage("Something went wrong. Try again later.");
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
          <p className="text-sm text-muted-foreground mt-4">
            Get release news and updates in your inbox.
          </p>
          <form
            onSubmit={handleNewsletter}
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch"
          >
            {/* Honeypot: hidden from users, catches naive bots. */}
            <input
              type="text"
              name="company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hidden"
            />
            <Input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (subMessage) setSubMessage(null);
                if (subStatus !== "idle") setSubStatus("idle");
              }}
              className="bg-background border-border text-foreground sm:max-w-xs"
              disabled={subStatus === "loading"}
            />
            <Button
              type="submit"
              disabled={subStatus === "loading"}
              variant="secondary"
              className="shrink-0"
            >
              {subStatus === "loading" ? "Sending…" : "Subscribe"}
            </Button>
          </form>
          {subMessage ? (
            <p
              className={
                subStatus === "ok"
                  ? "text-sm text-green-500/90 mt-2"
                  : "text-sm text-red-400 mt-2"
              }
            >
              {subMessage}
            </p>
          ) : null}
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
