"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import NewsletterToggle from "@/components/local-ui/NewsletterToggle";

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
  const pathname = usePathname();

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
          {/* Subtle newsletter signup. Full management lives in account settings,
              so it's hidden there to avoid showing the same toggle twice. */}
          {pathname !== "/account" ? (
            <div className="mt-4 max-w-xs">
              <NewsletterToggle compact />
            </div>
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
            Account
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
