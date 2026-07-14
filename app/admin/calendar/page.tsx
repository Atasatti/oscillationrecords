import { prisma } from "@/lib/prisma";
import { dayKeyUtc } from "@/lib/content-post";
import CalendarClient, { type Post, type ReleaseOption, type CalEvent } from "./CalendarClient";

export const dynamic = "force-dynamic";

export default async function ContentCalendarPage() {
  let posts: Post[] = [];
  let releases: ReleaseOption[] = [];
  let events: CalEvent[] = [];
  try {
    const [rows, rels, tasks, press, campaigns, placements] = await Promise.all([
      prisma.contentPost.findMany({ orderBy: { scheduledFor: "asc" } }),
      prisma.release.findMany({ select: { id: true, name: true, releaseDate: true }, orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.outreachTask.findMany({ where: { isTemplate: false, dueAt: { not: null } }, select: { id: true, title: true, dueAt: true, status: true }, take: 2000 }),
      prisma.pressItem.findMany({ where: { publishedAt: { not: null } }, select: { id: true, title: true, publishedAt: true }, take: 500 }),
      prisma.campaign.findMany({ select: { id: true, subject: true, scheduledFor: true, sentAt: true }, take: 500 }),
      prisma.placement.findMany({ where: { placedOn: { not: null } }, select: { id: true, outlet: true, name: true, placedOn: true }, take: 500 }),
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

    // Everything else dated across the label, read live, so the calendar reflects
    // the whole rollout. Read-only here (managed on its own page via the href).
    const ev: CalEvent[] = [];
    for (const r of rels) {
      if (r.releaseDate) ev.push({ id: `release-${r.id}`, type: "release", title: r.name, dateKey: dayKeyUtc(r.releaseDate), href: `/admin/releases/${r.id}/edit` });
    }
    for (const t of tasks) {
      if (t.dueAt && t.status !== "done") ev.push({ id: `task-${t.id}`, type: "task", title: t.title, dateKey: dayKeyUtc(t.dueAt), href: "/admin/tasks" });
    }
    for (const p of press) {
      if (p.publishedAt) ev.push({ id: `press-${p.id}`, type: "press", title: p.title, dateKey: dayKeyUtc(p.publishedAt), href: `/admin/press/${p.id}/edit` });
    }
    for (const c of campaigns) {
      const d = c.sentAt ?? c.scheduledFor;
      if (d) ev.push({ id: `campaign-${c.id}`, type: "newsletter", title: c.subject, dateKey: dayKeyUtc(d), href: "/admin/newsletter" });
    }
    for (const p of placements) {
      if (p.placedOn) ev.push({ id: `placement-${p.id}`, type: "placement", title: p.name ? `${p.outlet} — ${p.name}` : p.outlet, dateKey: dayKeyUtc(p.placedOn), href: "/admin/outreach/placements" });
    }
    events = ev;
  } catch {
    // Empty calendar on a transient DB error.
  }
  return <CalendarClient initial={posts} releases={releases} events={events} />;
}
