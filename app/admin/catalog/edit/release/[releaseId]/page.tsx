import { redirect } from "next/navigation";

// Legacy release-edit route — superseded by the unified Release Editor.
export default async function LegacyEditReleaseRedirect({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  redirect(`/admin/catalog/releases/${releaseId}/edit`);
}
