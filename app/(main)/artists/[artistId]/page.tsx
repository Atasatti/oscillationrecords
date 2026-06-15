import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getArtistDetail } from "@/lib/catalog-data";
import ArtistDetailView from "./ArtistDetailView";

// ISR: cache each artist page for a minute, regenerate on demand for new artists.
export const revalidate = 60;

export default async function ArtistDetail({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  // Artist + releases fetched on the server (in parallel inside the helper), so
  // the page ships fully rendered — no client waterfall or loading spinner.
  const data = await getArtistDetail(artistId);

  if (!data) {
    return (
      <div>
        <div className="min-h-screen text-white">
          <div className="px-[10%] py-14">
            <div className="text-center py-20">
              <p className="text-red-400 mb-4">Artist not found</p>
              <Link href="/artists">
                <Button variant="outline" className="border-gray-700">
                  Go Back
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <ArtistDetailView artist={data.artist} releases={data.releases} />;
}
