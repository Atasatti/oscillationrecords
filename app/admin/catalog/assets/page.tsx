import { prisma } from "@/lib/prisma";
import AssetsClient, { type Asset, type Option } from "./AssetsClient";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  let assets: Asset[] = [];
  let releases: Option[] = [];
  let artists: Option[] = [];
  try {
    const [rows, rels, arts] = await Promise.all([
      prisma.asset.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.release.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.artist.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    ]);

    const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter((v): v is string => !!v))];
    const users = uploaderIds.length
      ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true, email: true } })
      : [];
    const uploaderName = new Map(users.map((u) => [u.id, u.name || u.email || "Unknown"]));

    assets = rows.map((a) => ({
      id: a.id,
      category: a.category,
      title: a.title,
      fileName: a.fileName,
      fileUrl: a.fileUrl,
      mimeType: a.mimeType,
      size: a.size,
      releaseId: a.releaseId,
      artistId: a.artistId,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      uploader: a.uploadedById ? uploaderName.get(a.uploadedById) ?? null : null,
    }));
    releases = rels.map((r) => ({ id: r.id, name: r.name }));
    artists = arts.map((a) => ({ id: a.id, name: a.name }));
  } catch {
    // Empty library on a transient DB error.
  }
  return <AssetsClient initial={assets} releases={releases} artists={artists} />;
}
