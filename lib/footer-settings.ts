import { prisma } from "@/lib/prisma";
import { isSafeUrl } from "@/lib/url-safety";

export type FooterSocialLinks = {
  xLink: string | null;
  tiktokLink: string | null;
  youtubeLink: string | null;
  instagramLink: string | null;
  facebookLink: string | null;
  spotifyLink: string | null;
  soundcloudLink: string | null;
  bandcampLink: string | null;
  beatportLink: string | null;
};

const emptyFooter: FooterSocialLinks = {
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

export async function getFooterSocialLinks(): Promise<FooterSocialLinks> {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "site" },
      select: {
        footerXLink: true,
        footerTiktokLink: true,
        footerYoutubeLink: true,
        footerInstagramLink: true,
        footerFacebookLink: true,
        footerSpotifyLink: true,
        footerSoundcloudLink: true,
        footerBandcampLink: true,
        footerBeatportLink: true,
      },
    });
    if (!row) {
      return { ...emptyFooter };
    }
    return {
      xLink: row.footerXLink ?? null,
      tiktokLink: row.footerTiktokLink ?? null,
      youtubeLink: row.footerYoutubeLink ?? null,
      instagramLink: row.footerInstagramLink ?? null,
      facebookLink: row.footerFacebookLink ?? null,
      spotifyLink: row.footerSpotifyLink ?? null,
      soundcloudLink: row.footerSoundcloudLink ?? null,
      bandcampLink: row.footerBandcampLink ?? null,
      beatportLink: row.footerBeatportLink ?? null,
    };
  } catch (e) {
    console.error("getFooterSocialLinks: DB unavailable, using empty footer", e);
    return { ...emptyFooter };
  }
}

export function normalizeFooterUrl(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  // Reject dangerous schemes (javascript:, data:, …) — these render into public
  // footer <a href>s, so a stored value must never be able to execute script.
  return isSafeUrl(s) ? s : null;
}
