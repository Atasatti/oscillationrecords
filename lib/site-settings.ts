import { prisma } from "@/lib/prisma";
import { DEFAULT_STACKED_HERO_IMAGES } from "@/lib/site-settings-defaults";

export { DEFAULT_STACKED_HERO_IMAGES };

export type StackedHeroImages = {
  image1: string;
  image2: string;
  image3: string;
};

export async function getStackedHeroImages(): Promise<StackedHeroImages> {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "site" },
    });
    if (!row) {
      return { ...DEFAULT_STACKED_HERO_IMAGES };
    }
    return {
      image1: row.stackedHeroImage1,
      image2: row.stackedHeroImage2,
      image3: row.stackedHeroImage3,
    };
  } catch (e) {
    // Degrade gracefully when the DB is unavailable (mirrors getFooterSocialLinks),
    // so the homepage still renders with default hero art.
    console.error("getStackedHeroImages: DB unavailable, using defaults", e);
    return { ...DEFAULT_STACKED_HERO_IMAGES };
  }
}
