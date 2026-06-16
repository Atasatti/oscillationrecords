import type { Metadata } from "next";
import { getReleaseMeta } from "@/lib/catalog-data";
import { buildReleaseJsonLd, metaDescription, absoluteUrl, SITE_NAME } from "@/lib/seo";

// The release detail page itself is a client component (rich audio UI), so this
// server layout supplies the SEO metadata + schema.org JSON-LD for the route.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}): Promise<Metadata> {
  const { releaseId } = await params;
  const r = await getReleaseMeta(releaseId);
  if (!r) return { title: "Release" };

  const url = absoluteUrl(`/releases/${r.id}`);
  const artistSuffix = r.primaryArtist ? ` by ${r.primaryArtist.name}` : "";
  const description =
    metaDescription(r.description) ||
    `Listen to ${r.name}${artistSuffix} on ${SITE_NAME}.`;
  return {
    title: r.name,
    description,
    keywords: r.genres.length ? r.genres : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "music.album",
      title: r.name,
      description,
      url,
      siteName: SITE_NAME,
      images: r.coverImage ? [{ url: r.coverImage, alt: r.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: r.name,
      description,
      images: r.coverImage ? [r.coverImage] : undefined,
    },
  };
}

export default async function ReleaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  const r = await getReleaseMeta(releaseId);

  return (
    <>
      {r ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildReleaseJsonLd(r)) }}
        />
      ) : null}
      {children}
    </>
  );
}
