import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { AUDIT_RETENTION_MONTHS } from "@/lib/personal-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/account/export — GDPR data portability: returns everything we hold
// about the signed-in user as a downloadable JSON file.
//
// Every collection listed as `exported` in lib/personal-data.ts must appear here;
// lib/personal-data.test.ts fails the build if one is missing. This used to cover
// four collections while ten held user-linked rows — page views, contact
// messages, comments, uploads, campaigns and audit entries were all absent.
//
// OAuth tokens (Account) and server session rows are deliberately excluded — data
// minimisation: useless to the user, sensitive if an export leaked.
export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  // token.sub is the OAuth (Google) subject, NOT our Mongo user id — requireUser
  // has already resolved the account by email (the unique login key).
  const email = guard.token.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "No account email on session" }, { status: 400 });
  }
  const userId = guard.userId;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, image: true, emailVerified: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const byNewest = { orderBy: { createdAt: "desc" } } as const;
    const [
      profile,
      playEvents,
      pageViews,
      remixEntry,
      newsletter,
      savedViews,
      contactMessages,
      messageReplies,
      taskComments,
      assignedTasks,
      assets,
      campaigns,
      errorLogs,
      studioBookings,
      studioAccess,
      auditLog,
    ] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId } }),
      prisma.playEvent.findMany({ where: { userId }, ...byNewest }),
      prisma.pageView.findMany({ where: { userId }, ...byNewest }),
      prisma.benertRemixEntry.findUnique({ where: { userId } }),
      prisma.newsletterSubscriber.findUnique({ where: { email } }),
      prisma.savedView.findMany({ where: { userId }, ...byNewest }),
      // Both sides of a ticket: ones they sent, and ones assigned to them as staff.
      prisma.contactMessage.findMany({
        where: { OR: [{ userId }, { assigneeId: userId }] },
        ...byNewest,
      }),
      prisma.messageReply.findMany({
        where: { OR: [{ authorId: userId }, { authorEmail: email }] },
        ...byNewest,
      }),
      prisma.taskComment.findMany({
        where: { OR: [{ authorId: userId }, { authorEmail: email }, { mentions: { has: userId } }] },
        ...byNewest,
      }),
      prisma.outreachTask.findMany({ where: { assigneeId: userId }, ...byNewest }),
      prisma.asset.findMany({ where: { uploadedById: userId }, ...byNewest }),
      prisma.campaign.findMany({ where: { createdById: userId }, ...byNewest }),
      prisma.errorLog.findMany({ where: { userEmail: email }, orderBy: { lastSeen: "desc" } }),
      prisma.studioBooking.findMany({ where: { OR: [{ userId }, { bookerEmail: email.toLowerCase() }] }, ...byNewest }),
      prisma.studioBooker.findMany({ where: { email: email.toLowerCase() }, ...byNewest }),
      // Included so the one retention exception is transparent: these entries
      // survive account deletion, and the user can see exactly which they are.
      prisma.auditLog.findMany({
        where: { OR: [{ actorId: userId }, { actorEmail: email }] },
        orderBy: { at: "desc" },
      }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      // Machine-readable summary of what survives deletion, so the export itself
      // documents the retention exception rather than burying it in a policy page.
      retention: {
        note: "Everything below is deleted or anonymised when you delete your account, EXCEPT auditLog. See docs/DATA-RETENTION.md.",
        auditLogRetainedMonths: AUDIT_RETENTION_MONTHS,
      },
      account: user,
      profile,
      listeningHistory: playEvents,
      pageViews,
      competitionEntry: remixEntry,
      newsletter,
      savedViews,
      contactMessages,
      messageReplies,
      taskComments,
      assignedTasks,
      uploadedAssets: assets,
      newsletterCampaigns: campaigns,
      errorLogs,
      studioBookings,
      studioAccess: studioAccess,
      auditLog,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition":
          'attachment; filename="oscillation-records-my-data.json"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("account export error:", error);
    return NextResponse.json({ error: "Failed to export data" }, { status: 500 });
  }
}
