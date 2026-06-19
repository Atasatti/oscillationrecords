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

  const year = new Date().getFullYear();

  const navLinkCls =
    "text-muted-foreground hover:text-foreground transition-colors";

  return (
    <footer className="border-t border-border px-4 sm:px-6 md:px-[10%] pt-12 pb-6">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-12">
        {/* Logo, pinned left — links home like the navbar. */}
        <Link href="/" aria-label="Oscillation Records — home" className="flex items-center gap-2.5">
          <Image width={40} height={40} className="w-9 h-9" alt="" src="/logo-icon.svg" />
          <Image width={80} height={24} className="w-24 h-7" alt="Oscillation Records" src="/logo-name.svg" />
        </Link>

        {/* Social links, pinned right. */}
        {linksLoaded && socialItems.length > 0 ? (
          <div className="flex flex-wrap items-center gap-5 sm:ml-auto">
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
      </div>

      <div className="mt-10 flex flex-col-reverse items-center justify-between gap-3 border-t border-border pt-6 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          © {year} Oscillation Records. All rights reserved.
        </p>
        <div className="flex items-center gap-5 text-xs">
          <Link href="/privacy" className={navLinkCls}>Privacy</Link>
          <Link href="/terms" className={navLinkCls}>Terms</Link>
          <Link href="/account" className={navLinkCls}>Account</Link>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
            className={navLinkCls}
          >
            Cookies
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
