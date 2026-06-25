import { notFound, permanentRedirect } from "next/navigation";
import { getReleaseDetail, resolveReleaseIdBySlug } from "@/lib/catalog-data";
import { OBJECT_ID_RE, slugify } from "@/lib/slug";
import { SITE_NAME } from "@/lib/seo";
import ReleaseDetailView from "./ReleaseDetailView";

// ISR: cache each release page for a minute; new/updated releases refresh on
// demand. generateStaticParams, per-release metadata, and the MusicAlbum JSON-LD
// live in layout.tsx — this page renders the human-visible content on the server
// so the tracklist/description/credits ship in the initial HTML (crawlable),
// not behind a client fetch.
export const revalidate = 60;

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId: param } = await params;

  // Legacy /releases/<id> links 308-redirect to the canonical title-slug, so old
  // bookmarks/shares keep working and Google consolidates onto the slug.
  if (OBJECT_ID_RE.test(param)) {
    const legacy = await getReleaseDetail(param);
    if (!legacy) notFound();
    permanentRedirect(`/releases/${slugify(legacy.name)}`);
  }

  const id = await resolveReleaseIdBySlug(param);
  const release = id ? await getReleaseDetail(id) : null;
  // Missing or DRAFT → a real 404 (not a soft-404 that serves 200 + "not found").
  if (!release) notFound();

  // Crisp, factual lead — the sentence AI engines lift verbatim and attribute.
  // Visually hidden (the page leads with cover art) but in the DOM for crawlers.
  const kindLabel = release.type === "ep" ? "EP" : release.type;
  const article = release.type === "single" ? "a" : "an";
  const primaryNames = release.primaryArtistIds
    .map((pid) => release.artists.find((ar) => ar.id === pid)?.name)
    .filter((n): n is string => Boolean(n));
  const by = primaryNames.length ? ` by ${primaryNames.join(", ")}` : "";
  const dateStr = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const releaseLead = dateStr
    ? `${release.name} is ${article} ${kindLabel}${by}, released ${dateStr} on ${SITE_NAME}, an independent UK record label.`
    : `${release.name} is an upcoming ${kindLabel}${by} on ${SITE_NAME}, an independent UK record label.`;

  return (
    <>
      <p className="sr-only">{releaseLead}</p>
      <ReleaseDetailView release={release} />
    </>
  );
}
