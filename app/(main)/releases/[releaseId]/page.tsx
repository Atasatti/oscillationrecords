import { notFound } from "next/navigation";
import { getReleaseDetail } from "@/lib/catalog-data";
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
  const { releaseId } = await params;
  const release = await getReleaseDetail(releaseId);
  // Missing or DRAFT → a real 404 (not a soft-404 that serves 200 + "not found").
  if (!release) notFound();
  return <ReleaseDetailView release={release} />;
}
