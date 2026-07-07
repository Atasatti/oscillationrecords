import { prisma } from "@/lib/prisma";
import { artistPublishChecks } from "@/lib/artist-onboarding";
import OnboardingClient, { type Row } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default async function ArtistOnboardingPage() {
  let rows: Row[] = [];
  try {
    const artists = await prisma.artist.findMany({
      select: { id: true, name: true, biography: true, profilePicture: true, draft: true, showOnWebsite: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    rows = artists.map((a) => ({
      id: a.id,
      name: a.name,
      draft: a.draft,
      showOnWebsite: a.showOnWebsite,
      checks: artistPublishChecks(a),
      createdAt: a.createdAt.toISOString(),
    }));
  } catch {
    // Empty list on a transient DB error.
  }
  return <OnboardingClient initial={rows} />;
}
