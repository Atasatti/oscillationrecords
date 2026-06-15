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

/**
 * Ordered list of "studio photos" for the home carousel. Falls back to the three
 * stacked-hero images (and ultimately the built-in defaults) so the carousel is
 * never empty until an admin curates a dedicated set. Degrades gracefully if the
 * DB is unavailable.
 */
export async function getStudioPhotos(): Promise<string[]> {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "site" },
    });
    if (!row) {
      return Object.values(DEFAULT_STACKED_HERO_IMAGES);
    }
    if (row.studioPhotos && row.studioPhotos.length > 0) {
      return row.studioPhotos;
    }
    // No dedicated set yet — seed the carousel from the existing hero images.
    return [row.stackedHeroImage1, row.stackedHeroImage2, row.stackedHeroImage3];
  } catch (e) {
    console.error("getStudioPhotos: DB unavailable, using defaults", e);
    return Object.values(DEFAULT_STACKED_HERO_IMAGES);
  }
}
