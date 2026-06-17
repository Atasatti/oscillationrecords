import { redirect } from "next/navigation";

// Legacy "create single" route — superseded by the unified Release Editor.
export default async function LegacyCreateSingleRedirect({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  redirect(`/admin/catalog/releases/new?artistId=${artistId}&kind=single`);
}
