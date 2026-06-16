import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/seo";

// Regenerate hourly. Lists static pages + every public artist and release so
// search engines can discover and crawl them all.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/artists`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/releases`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/contact`, changeFrequency: "monthly", priority: 0.5 },
  ];

  try {
    const [artists, releases] = await Promise.all([
      prisma.artist.findMany({
        where: { showOnWebsite: true },
        select: { id: true, updatedAt: true },
      }),
      prisma.release.findMany({ select: { id: true, updatedAt: true } }),
    ]);

    return [
      ...staticRoutes,
      ...artists.map((a) => ({
        url: `${SITE_URL}/artists/${a.id}`,
        lastModified: a.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...releases.map((r) => ({
        url: `${SITE_URL}/releases/${r.id}`,
        lastModified: r.updatedAt,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
    ];
  } catch (e) {
    console.error("sitemap: DB unavailable", e);
    return staticRoutes;
  }
}
