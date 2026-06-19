import { redirect } from "next/navigation";

// The Artist Editor is the sole artist surface, so a bare artist URL has no
// standalone "details" page — send it straight to the editor (also fixes the
// breadcrumb "Details" crumb 404).
export default async function ArtistDetailsRedirect({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  redirect(`/admin/catalog/artists/${artistId}/edit`);
}
