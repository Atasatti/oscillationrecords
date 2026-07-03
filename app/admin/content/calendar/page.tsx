import { prisma } from "@/lib/prisma";
import CalendarClient, { type Post, type ReleaseOption } from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function ContentCalendarPage() {
  let posts: Post[] = [];
  let releases: ReleaseOption[] = [];
  try {
    const [rows, rels] = await Promise.all([
      prisma.contentPost.findMany({ orderBy: { scheduledFor: "asc" } }),
      prisma.release.findMany({
        select: { id: true, name: true },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
    ]);
    posts = rows.map((p) => ({
      id: p.id,
      releaseId: p.releaseId,
      title: p.title,
      platform: p.platform,
      scheduledFor: p.scheduledFor.toISOString(),
      status: p.status,
      copy: p.copy,
      assetLink: p.assetLink,
      notes: p.notes,
    }));
    releases = rels.map((r) => ({ id: r.id, name: r.name }));
  } catch {
    // Empty calendar on a transient DB error.
  }
  return <CalendarClient initial={posts} releases={releases} />;
}
