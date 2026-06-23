import { redirect } from "next/navigation";

// The Release Editor is the sole release surface, so a bare release URL has no
// standalone "details" page — send it straight to the editor (also fixes the
// breadcrumb "Details" crumb 404).
export default async function ReleaseDetailsRedirect({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  redirect(`/admin/catalog/releases/${releaseId}/edit`);
}
