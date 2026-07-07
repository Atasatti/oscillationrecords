import { prisma } from "@/lib/prisma";
import AdminDemosClient, { type Demo } from "./AdminDemosClient";

export const dynamic = "force-dynamic";

export default async function DemosPage() {
  let demos: Demo[] = [];
  try {
    const rows = await prisma.demo.findMany({ orderBy: { createdAt: "desc" } });
    demos = rows.map((d) => ({
      id: d.id,
      artistName: d.artistName,
      contactName: d.contactName,
      contactEmail: d.contactEmail,
      link: d.link,
      genre: d.genre,
      source: d.source,
      stage: d.stage,
      rating: d.rating,
      notes: d.notes,
      createdAt: d.createdAt.toISOString(),
    }));
  } catch {
    // Empty list on a transient DB error.
  }
  return <AdminDemosClient initial={demos} />;
}
