import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { publicReleaseWhere } from "@/lib/catalog-data";
import { SITE_URL, absoluteUrl } from "@/lib/seo";
import { slugify } from "@/lib/slug";

// Regenerate hourly. Lists static pages + every public artist and release so
// search engines can discover and crawl them all.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/artists`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/releases`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/press`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const [artists, releases] = await Promise.all([
      prisma.artist.findMany({
        where: { showOnWebsite: true },
        select: { id: true, name: true, updatedAt: true, profilePicture: true },
      }),
      prisma.release.findMany({
        where: publicReleaseWhere(),
        select: { id: true, name: true, updatedAt: true, coverImage: true },
      }),
    ]);

    return [
      ...staticRoutes,
      // `images` emits Google's <image:image> sitemap extension, the explicit
      // per-page signal that surfaces these photos/covers in Google Images.
      // absoluteUrl is a no-op on the already-absolute S3 URLs but guards
      // against any relative path.
      ...artists.map((a) => ({
        url: `${SITE_URL}/artists/${slugify(a.name)}`,
        lastModified: a.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
        ...(a.profilePicture ? { images: [absoluteUrl(a.profilePicture)] } : {}),
      })),
      ...releases.map((r) => ({
        url: `${SITE_URL}/releases/${slugify(r.name)}`,
        lastModified: r.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
        ...(r.coverImage ? { images: [absoluteUrl(r.coverImage)] } : {}),
      })),
    ];
  } catch (e) {
    console.error("sitemap: DB unavailable", e);
    return staticRoutes;
  }
}
