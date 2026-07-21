import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-guard";
import PlacementsClient, { type Placement, type Option } from "./PlacementsClient";

export const dynamic = "force-dynamic";

export default async function PlacementsPage() {
  // Revocation-aware gate before reading placements. Matches the API's outreach:read.
  await requirePagePermission("outreach:read");

  let placements: Placement[] = [];
  let releases: Option[] = [];
  let artists: Option[] = [];
  try {
    const [rows, rels, arts] = await Promise.all([
      prisma.placement.findMany({ orderBy: [{ placedOn: "desc" }, { createdAt: "desc" }] }),
      prisma.release.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 300 }),
      prisma.artist.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }),
    ]);
    placements = rows.map((p) => ({
      id: p.id,
      type: p.type,
      outlet: p.outlet,
      name: p.name,
      url: p.url,
      reach: p.reach,
      placedOn: p.placedOn ? p.placedOn.toISOString() : null,
      releaseId: p.releaseId,
      artistId: p.artistId,
      notes: p.notes,
    }));
    releases = rels.map((r) => ({ id: r.id, name: r.name }));
    artists = arts.map((a) => ({ id: a.id, name: a.name }));
  } catch {
    // Empty list on a transient DB error.
  }
  return <PlacementsClient initial={placements} releases={releases} artists={artists} />;
}
