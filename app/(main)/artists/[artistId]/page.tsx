import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getArtistDetail,
  getArtistSlugIndex,
  getPressForArtist,
  resolveArtistIdBySlug,
} from "@/lib/catalog-data";
import { ARTIST_ID_RE, slugify } from "@/lib/slug";
import ArtistPressSection from "./ArtistPressSection";
import {
  buildArtistJsonLd,
  buildBreadcrumbJsonLd,
  metaDescription,
  absoluteUrl,
  SITE_NAME,
} from "@/lib/seo";
import ArtistDetailView from "./ArtistDetailView";

// ISR: cache each artist page for a minute, regenerate on demand for new artists.
export const revalidate = 60;

// Prerender every live artist at build (by slug) so pages serve from cache (fast
// TTFB); artists added later render on demand and are then cached (ISR). The
// `[artistId]` segment now holds a name-slug; legacy id URLs 308-redirect below.
export async function generateStaticParams() {
  try {
    const index = await getArtistSlugIndex();
    // Dedupe in case two names slugify to the same string (rare for a curated roster).
    return Array.from(new Set(index.map((a) => a.slug))).map((slug) => ({
      artistId: slug,
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ artistId: string }>;
}): Promise<Metadata> {
  const { artistId: param } = await params;
  const id = ARTIST_ID_RE.test(param) ? param : await resolveArtistIdBySlug(param);
  const data = id ? await getArtistDetail(id) : null;
  if (!data) return { title: "Artist not found" };
  const a = data.artist;
  const url = absoluteUrl(`/artists/${slugify(a.name)}`);
  const description = metaDescription(a.biography) || `${a.name} on ${SITE_NAME}.`;
  return {
    title: a.name,
    description,
    keywords: a.genres?.length ? a.genres : undefined,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title: a.name,
      description,
      url,
      siteName: SITE_NAME,
      images: a.profilePicture ? [{ url: a.profilePicture, alt: a.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: a.name,
      description,
      images: a.profilePicture ? [a.profilePicture] : undefined,
    },
  };
}

export default async function ArtistDetail({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId: param } = await params;

  // Legacy `/artists/<id>` links 308-redirect to the canonical name-slug URL, so
  // old bookmarks/shares keep working and Google consolidates onto the slug.
  if (ARTIST_ID_RE.test(param)) {
    const legacy = await getArtistDetail(param);
    if (!legacy) notFound();
    permanentRedirect(`/artists/${slugify(legacy.artist.name)}`);
  }

  // Slug path: resolve to an id, then load the artist + releases on the server
  // (in parallel inside the helper) so the page ships fully rendered.
  const id = await resolveArtistIdBySlug(param);
  const data = id ? await getArtistDetail(id) : null;

  if (!id || !data) notFound();

  const jsonLd = buildArtistJsonLd(data.artist, data.releases);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "/" },
    { name: "Artists", url: "/artists" },
    { name: data.artist.name, url: `/artists/${slugify(data.artist.name)}` },
  ]);
  const press = await getPressForArtist(id);

  // A crisp, factual lead sentence — the clean fact AI engines lift verbatim and
  // attribute. Visually hidden (the design hero is image-led) but in the DOM.
  const a = data.artist;
  const artistLead =
    `${a.name} is a recording artist on ${SITE_NAME}, an independent UK record label` +
    (a.city ? `, based in ${a.city}` : "") +
    "." +
    (a.genres?.length ? ` ${a.name}'s music spans ${a.genres.join(", ")}.` : "") +
    (data.releases.length
      ? ` Releases on ${SITE_NAME} include ${data.releases.slice(0, 5).map((r) => r.name).join(", ")}.`
      : "");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <p className="sr-only">{artistLead}</p>
      <ArtistDetailView artist={data.artist} releases={data.releases} />
      <ArtistPressSection items={press} />
    </>
  );
}
