import { redirect } from "next/navigation";

// Legacy artist-edit route — superseded by /admin/artists/[id]/edit.
export default async function LegacyEditArtistRedirect({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  redirect(`/admin/artists/${artistId}/edit`);
}
