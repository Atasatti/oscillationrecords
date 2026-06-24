import type { Metadata } from "next";
import {
  getReleaseMeta,
  getReleaseSlugIndex,
  resolveReleaseIdBySlug,
} from "@/lib/catalog-data";
import { OBJECT_ID_RE, slugify } from "@/lib/slug";
import {
  buildReleaseJsonLd,
  buildBreadcrumbJsonLd,
  metaDescription,
  absoluteUrl,
  SITE_NAME,
} from "@/lib/seo";

// Prerender every release at build for fast TTFB; new releases render on demand
// and are then cached.
export async function generateStaticParams() {
  try {
    // Prebuild RELEASED + SCHEDULED (Coming-Soon pages are public); never DRAFT.
    // The [releaseId] segment now holds a title-slug; legacy id URLs 308-redirect
    // to the slug in page.tsx.
    const index = await getReleaseSlugIndex();
    return Array.from(new Set(index.map((r) => r.slug))).map((slug) => ({
      releaseId: slug,
    }));
  } catch {
    return [];
  }
}

// The release detail page itself is a client component (rich audio UI), so this
// server layout supplies the SEO metadata + schema.org JSON-LD for the route.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}): Promise<Metadata> {
  const { releaseId: param } = await params;
  const id = OBJECT_ID_RE.test(param) ? param : await resolveReleaseIdBySlug(param);
  const r = id ? await getReleaseMeta(id) : null;
  if (!r) return { title: "Release" };

  const url = absoluteUrl(`/releases/${slugify(r.name)}`);
  const artistNames = r.primaryArtists.map((a) => a.name).join(", ");
  const artistSuffix = artistNames ? ` by ${artistNames}` : "";
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
  const { releaseId: param } = await params;
  const id = OBJECT_ID_RE.test(param) ? param : await resolveReleaseIdBySlug(param);
  const r = id ? await getReleaseMeta(id) : null;

  return (
    <>
      {r ? (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(buildReleaseJsonLd(r)) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(
                buildBreadcrumbJsonLd([
                  { name: "Home", url: "/" },
                  { name: "Releases", url: "/releases" },
                  { name: r.name, url: `/releases/${slugify(r.name)}` },
                ])
              ),
            }}
          />
        </>
      ) : null}
      {children}
    </>
  );
}
