// Editable "page media" — decorative/branding images on the public pages that
// an admin can override from the admin "Site images" screen. Each value is
// either a stored image URL (uploaded to S3) or, by default, the built-in asset
// in /public. This module is PURE (no server imports) so it can be shared by the
// server reader (lib/page-media.ts), the admin UI, the client hook, and the
// public components' fallbacks.

export interface PageMedia {
  // Home page
  homeNoProfit: string;
  // About page
  aboutHero: string;
  aboutMain: string;
  aboutSide1: string;
  aboutSide2: string;
  aboutSide3: string;
  // Shared section background patterns
  bgHero: string;
  bgProfit: string;
  bgAboutSection2: string;
  bgMusicHeard: string;
  // Contact page collage (ordered: first 5 = left column, next 4 = right column)
  contactArtworks: string[];
}

export type PageMediaKey = keyof PageMedia;
/** The single-image keys (everything except the contact list). */
export type PageImageKey = Exclude<PageMediaKey, "contactArtworks">;

export const DEFAULT_PAGE_MEDIA: PageMedia = {
  homeNoProfit: "/profit-img.svg",
  aboutHero: "/about-hero-img.svg",
  aboutMain: "/about-section2-img.svg",
  aboutSide1: "/about-section2-side1.svg",
  aboutSide2: "/about-section2-side2.svg",
  aboutSide3: "/about-section2-side3.svg",
  bgHero: "/hero-bg.svg",
  bgProfit: "/profit-bg.svg",
  bgAboutSection2: "/about-section2-bg.svg",
  bgMusicHeard: "/music-heard-bg.svg",
  contactArtworks: [
    "/artwork1.jpeg",
    "/artwork2.jpeg",
    "/artwork3.jpeg",
    "/artwork4.jpeg",
    "/artwork9.jpeg",
    "/artwork5.jpeg",
    "/artwork6.jpeg",
    "/artwork7.jpeg",
    "/artwork8.jpeg",
  ],
};

export type PageImageGroup = "home" | "about" | "backgrounds";

export interface PageImageFieldDef {
  key: PageImageKey;
  label: string;
  description: string;
  group: PageImageGroup;
}

// Drives the admin single-image editors (and guarantees the admin only ever
// writes keys the public site actually reads).
export const PAGE_IMAGE_FIELDS: PageImageFieldDef[] = [
  {
    key: "homeNoProfit",
    label: "“Not Profit” image",
    description: "The floating image in the home page’s “Built for Artists, Not Profit” section.",
    group: "home",
  },
  {
    key: "aboutHero",
    label: "Hero image",
    description: "The large floating image at the top of the About page.",
    group: "about",
  },
  {
    key: "aboutMain",
    label: "Centre image",
    description: "The main image between the text blocks on the About page.",
    group: "about",
  },
  {
    key: "aboutSide1",
    label: "Floating image 1",
    description: "Decorative floating image on the About page (used in two spots).",
    group: "about",
  },
  {
    key: "aboutSide2",
    label: "Floating image 2",
    description: "Top-right decorative floating image on the About page.",
    group: "about",
  },
  {
    key: "aboutSide3",
    label: "Floating image 3",
    description: "Bottom-left decorative floating image on the About page.",
    group: "about",
  },
  {
    key: "bgHero",
    label: "Hero / waves background",
    description: "Wave pattern behind the home hero, About hero, Upcoming and Artists sections.",
    group: "backgrounds",
  },
  {
    key: "bgProfit",
    label: "“Not Profit” / Contact background",
    description: "Pattern behind the home “Not Profit” section and the Contact page.",
    group: "backgrounds",
  },
  {
    key: "bgAboutSection2",
    label: "About section background",
    description: "Background pattern behind the main About content section.",
    group: "backgrounds",
  },
  {
    key: "bgMusicHeard",
    label: "“Music heard” background",
    description: "Pattern behind the “Send us your demo / music heard” call-to-action strip.",
    group: "backgrounds",
  },
];

/** Merge stored overrides over the built-in defaults, ignoring empty values. */
export function mergePageMedia(stored: Partial<PageMedia> | null | undefined): PageMedia {
  const out: PageMedia = { ...DEFAULT_PAGE_MEDIA };
  if (!stored) return out;
  for (const [k, v] of Object.entries(stored)) {
    if (k === "contactArtworks") {
      if (Array.isArray(v) && v.length > 0) {
        out.contactArtworks = v.filter((x): x is string => typeof x === "string" && x.length > 0);
      }
      continue;
    }
    if (typeof v === "string" && v.trim()) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}
