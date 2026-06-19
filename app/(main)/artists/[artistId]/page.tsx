import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getArtistDetail, getPressForArtist } from "@/lib/catalog-data";
import PressCard from "@/components/local-ui/PressCard";
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

// Prerender every live artist at build so pages serve from cache (fast TTFB);
// artists added later render on demand and are then cached (ISR).
export async function generateStaticParams() {
  try {
    const artists = await prisma.artist.findMany({
      where: { showOnWebsite: true },
      select: { id: true },
    });
    return artists.map((a) => ({ artistId: a.id }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ artistId: string }>;
}): Promise<Metadata> {
  const { artistId } = await params;
  const data = await getArtistDetail(artistId);
  if (!data) return { title: "Artist not found" };
  const a = data.artist;
  const url = absoluteUrl(`/artists/${a.id}`);
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
  const { artistId } = await params;
  // Artist + releases fetched on the server (in parallel inside the helper), so
  // the page ships fully rendered — no client waterfall or loading spinner.
  const data = await getArtistDetail(artistId);

  if (!data) notFound();

  const jsonLd = buildArtistJsonLd(data.artist, data.releases);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", url: "/" },
    { name: "Artists", url: "/artists" },
    { name: data.artist.name, url: `/artists/${data.artist.id}` },
  ]);
  const press = await getPressForArtist(artistId);

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
      <ArtistDetailView artist={data.artist} releases={data.releases} />
      {press.length > 0 ? (
        <section className="px-[10%] py-14 text-white">
          <h2 className="mb-6 text-2xl font-light tracking-tighter">Press &amp; Features</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {press.map((item) => (
              <PressCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
