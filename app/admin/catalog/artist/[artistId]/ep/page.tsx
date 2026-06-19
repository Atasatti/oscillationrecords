import { redirect } from "next/navigation";

// Legacy "create EP" route — superseded by the unified Release Editor.
export default async function LegacyCreateEpRedirect({
  params,
}: {
  params: Promise<{ artistId: string }>;
}) {
  const { artistId } = await params;
  redirect(`/admin/catalog/releases/new?artistId=${artistId}&kind=ep`);
}
