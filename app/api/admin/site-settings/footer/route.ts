import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { DEFAULT_STACKED_HERO_IMAGES } from "@/lib/site-settings-defaults";
import { normalizeFooterUrl } from "@/lib/footer-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const data = {
      footerXLink: normalizeFooterUrl(body.xLink),
      footerTiktokLink: normalizeFooterUrl(body.tiktokLink),
      footerYoutubeLink: normalizeFooterUrl(body.youtubeLink),
      footerInstagramLink: normalizeFooterUrl(body.instagramLink),
      footerFacebookLink: normalizeFooterUrl(body.facebookLink),
      footerSpotifyLink: normalizeFooterUrl(body.spotifyLink),
      footerSoundcloudLink: normalizeFooterUrl(body.soundcloudLink),
      footerBandcampLink: normalizeFooterUrl(body.bandcampLink),
      footerBeatportLink: normalizeFooterUrl(body.beatportLink),
    };

    await prisma.siteSettings.upsert({
      where: { id: "site" },
      create: {
        id: "site",
        stackedHeroImage1: DEFAULT_STACKED_HERO_IMAGES.image1,
        stackedHeroImage2: DEFAULT_STACKED_HERO_IMAGES.image2,
        stackedHeroImage3: DEFAULT_STACKED_HERO_IMAGES.image3,
        ...data,
      },
      update: data,
    });

    revalidatePath("/");

    return NextResponse.json({
      xLink: data.footerXLink,
      tiktokLink: data.footerTiktokLink,
      youtubeLink: data.footerYoutubeLink,
      instagramLink: data.footerInstagramLink,
      facebookLink: data.footerFacebookLink,
      spotifyLink: data.footerSpotifyLink,
      soundcloudLink: data.footerSoundcloudLink,
      bandcampLink: data.footerBandcampLink,
      beatportLink: data.footerBeatportLink,
    });
  } catch (error) {
    console.error("Error saving footer links:", error);
    return NextResponse.json(
      { error: "Failed to save footer links" },
      { status: 500 }
    );
  }
}
