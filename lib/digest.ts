// Daily ops digest — a summary email for staff, built from existing data (open
// messages, draft/upcoming releases, new demos, recent placements). Server-only
// (touches prisma). Renders to HTML via the shared email shell.
import { prisma } from "@/lib/prisma";
import { emailShell, escapeHtml, siteBaseUrl } from "@/lib/email";

const DAY = 86_400_000;

export type DigestResult = { subject: string; html: string; isEmpty: boolean };

function section(title: string, rowsHtml: string): string {
  return [
    `<h2 style="margin:22px 0 8px;font-size:15px;color:#ffffff">${escapeHtml(title)}</h2>`,
    rowsHtml,
  ].join("");
}

function line(text: string): string {
  return `<p style="margin:0 0 6px;font-size:13px;color:#c9c9cf;line-height:1.5">${text}</p>`;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Build the daily digest. Every query is independently guarded so one failing
 *  source degrades to an empty section rather than losing the whole email. */
export async function buildDigest(now: Date = new Date()): Promise<DigestResult> {
  const in14 = new Date(now.getTime() + 14 * DAY);
  const last7 = new Date(now.getTime() - 7 * DAY);
  const base = siteBaseUrl();

  const [openMsgCount, drafts, upcoming, demoCount, demos, placements] = await Promise.all([
    prisma.contactMessage.count({ where: { handled: false } }).catch(() => 0),
    prisma.release.count({ where: { status: "DRAFT" } }).catch(() => 0),
    prisma.release
      .findMany({
        where: { status: "SCHEDULED", releaseDate: { gte: now, lte: in14 } },
        orderBy: { releaseDate: "asc" },
        take: 6,
        select: { name: true, releaseDate: true },
      })
      .catch(() => [] as { name: string; releaseDate: Date | null }[]),
    prisma.demo.count({ where: { stage: "received" } }).catch(() => 0),
    prisma.demo
      .findMany({ where: { stage: "received" }, orderBy: { createdAt: "desc" }, take: 5, select: { artistName: true, genre: true } })
      .catch(() => [] as { artistName: string; genre: string | null }[]),
    prisma.placement
      .findMany({ where: { placedOn: { gte: last7 } }, orderBy: { placedOn: "desc" }, take: 5, select: { type: true, outlet: true, name: true } })
      .catch(() => [] as { type: string; outlet: string; name: string | null }[]),
  ]);

  const parts: string[] = [];

  if (openMsgCount > 0) {
    parts.push(section(
      `${openMsgCount} open message${openMsgCount === 1 ? "" : "s"}`,
      line(`<a href="${base}/admin/messages" style="color:#7aa2ff">Review the inbox →</a>`)
    ));
  }
  if (drafts > 0) {
    parts.push(section(
      `${drafts} draft release${drafts === 1 ? "" : "s"}`,
      line(`<a href="${base}/admin/releases" style="color:#7aa2ff">Finish and publish →</a>`)
    ));
  }
  if (upcoming.length > 0) {
    parts.push(section(
      "Releasing in the next 14 days",
      upcoming.map((r) => line(`${escapeHtml(r.name)}${r.releaseDate ? ` — <span style="color:#9a9aa2">${fmtDate(r.releaseDate)}</span>` : ""}`)).join("")
    ));
  }
  if (demoCount > 0) {
    parts.push(section(
      `${demoCount} demo${demoCount === 1 ? "" : "s"} to review`,
      demos.map((d) => line(`${escapeHtml(d.artistName)}${d.genre ? ` <span style="color:#9a9aa2">· ${escapeHtml(d.genre)}</span>` : ""}`)).join("") +
        line(`<a href="${base}/admin/outreach/demos" style="color:#7aa2ff">Open A&amp;R →</a>`)
    ));
  }
  if (placements.length > 0) {
    parts.push(section(
      "Recent wins",
      placements.map((p) => line(`<strong style="color:#e7e7ea">${escapeHtml(p.outlet)}</strong>${p.name ? ` — ${escapeHtml(p.name)}` : ""} <span style="color:#9a9aa2">(${escapeHtml(p.type)})</span>`)).join("")
    ));
  }

  const isEmpty = parts.length === 0;
  const dateStr = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const inner = [
    `<h1 style="margin:0 0 4px;font-size:20px;color:#ffffff">Daily digest</h1>`,
    `<p style="margin:0 0 8px;font-size:13px;color:#9a9aa2">${escapeHtml(dateStr)}</p>`,
    isEmpty
      ? line("Nothing needs attention today. 🎉")
      : parts.join(""),
    `<p style="margin:24px 0 0;font-size:12px;color:#8a8a92"><a href="${base}/admin" style="color:#7aa2ff">Open the admin dashboard →</a></p>`,
  ].join("");

  return {
    subject: `Oscillation Records — daily digest (${now.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })})`,
    html: emailShell(inner, { preheader: isEmpty ? "All clear today" : "Your label's daily summary" }),
    isEmpty,
  };
}
