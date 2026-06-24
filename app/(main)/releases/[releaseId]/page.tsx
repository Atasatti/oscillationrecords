import { notFound, permanentRedirect } from "next/navigation";
import { getReleaseDetail, resolveReleaseIdBySlug } from "@/lib/catalog-data";
import { OBJECT_ID_RE, slugify } from "@/lib/slug";
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
  return <ReleaseDetailView release={release} />;
}
