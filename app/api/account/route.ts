import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REDACTED_EMAIL, REDACTED_NAME } from "@/lib/personal-data";
import { requireUser, isSameOrigin } from "@/lib/auth-guard";
import { deleteS3Object, keyFromOwnBucketUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// DELETE /api/account — GDPR right to erasure.
//
// Prisma's onDelete: Cascade only fires for the models with a real `user`
// relation (Account, Session, UserProfile, PlayEvent, BenertRemixEntry,
// SavedView). Everything that stores a bare `userId`/`authorId`/`createdById`
// string — page views, contact messages, replies, task comments, assignments,
// uploads, campaigns, error attributions — has no relation to cascade, so it
// survived deletion untouched. Those are handled explicitly below.
//
// What happens to each collection, and why, is declared in
// lib/personal-data.ts and narrated in docs/DATA-RETENTION.md;
// lib/personal-data.test.ts fails if this route stops matching that inventory.
export async function DELETE(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  // Irreversible erasure — add a CSRF Origin check on top of SameSite=lax.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  // token.sub is the OAuth subject, NOT our Mongo user id — delete by email (the
  // unique login key); the schema cascade removes accounts/sessions/profile/
  // history/entry. (Deleting by token.sub threw "Malformed ObjectID".)
  const email = guard.token.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "No account email on session" }, { status: 400 });
  }

  try {
    // The competition entry cascades away with the user, but its uploaded audio
    // is an S3 object with no owner once the row is gone — an orphaned file of
    // the user's own work surviving their erasure request. Read the URL before
    // the cascade removes the only reference to it.
    const entry = await prisma.benertRemixEntry
      .findFirst({ where: { user: { email } }, select: { uploadedFileUrl: true } })
      .catch(() => null);

    const userId = guard.userId;

    await prisma.$transaction([
      // DELETE — rows that are only ever about this person.
      prisma.newsletterSubscriber.deleteMany({ where: { email } }),
      // PageView has no relation, so nothing cascades. Anonymous rows (visitorId
      // only) are untouched; this removes just their identified browsing history,
      // matching what PlayEvent's cascade already does for listening history.
      prisma.pageView.deleteMany({ where: { userId } }),

      // REDACT — correspondence they sent us. The thread and the label's replies
      // survive (a ticket may be mid-conversation); who sent it does not.
      prisma.contactMessage.updateMany({
        where: { userId },
        data: { userId: null, name: REDACTED_NAME, email: REDACTED_EMAIL },
      }),

      // ANONYMIZE — shared business records that no longer need to name them.
      prisma.contactMessage.updateMany({
        where: { assigneeId: userId },
        data: { assigneeId: null },
      }),
      prisma.messageReply.updateMany({
        where: { OR: [{ authorId: userId }, { authorEmail: email }] },
        data: { authorId: null, authorEmail: null },
      }),
      prisma.taskComment.updateMany({
        where: { OR: [{ authorId: userId }, { authorEmail: email }] },
        data: { authorId: null, authorEmail: null },
      }),
      prisma.outreachTask.updateMany({ where: { assigneeId: userId }, data: { assigneeId: null } }),
      prisma.asset.updateMany({ where: { uploadedById: userId }, data: { uploadedById: null } }),
      prisma.campaign.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
      prisma.errorLog.updateMany({ where: { userEmail: email }, data: { userEmail: null } }),

      // RETAIN — AuditLog is deliberately absent. Admin actions stay attributable
      // for security and accountability; an audit trail a deletion can rewrite is
      // not an audit trail. Purged on age instead (AUDIT_RETENTION_MONTHS,
      // scripts/purge-audit-logs.mjs), and included in the user's export so the
      // exception is visible to them.

      // Last: the account itself, cascading Account / Session / UserProfile /
      // PlayEvent / BenertRemixEntry / SavedView.
      prisma.user.delete({ where: { email } }),
    ]);

    // `mentions` is a scalar list, so removing one id needs an array update
    // rather than a field assignment — $pull drops this user from every comment
    // that @-mentioned them, leaving other mentions intact. Runs OUTSIDE the
    // transaction because Prisma doesn't support $runCommandRaw inside one, and
    // best-effort by design: a leftover id in a mentions array must not fail an
    // erasure request that has otherwise completed.
    try {
      await prisma.$runCommandRaw({
        update: "TaskComment",
        updates: [
          {
            q: { mentions: { $oid: userId } },
            u: { $pull: { mentions: { $oid: userId } } },
            multi: true,
          },
        ],
      } as unknown as Prisma.InputJsonObject);
    } catch (e) {
      console.error("account deletion: failed to clear task mentions", e);
    }

    // Best-effort, and only under the prefix competition uploads own, so a
    // tampered record can't aim it at another object. After the transaction: a
    // failed deletion must not leave the file deleted with the account intact.
    const key = entry?.uploadedFileUrl ? keyFromOwnBucketUrl(entry.uploadedFileUrl) : null;
    if (key?.startsWith("benert-remix/")) await deleteS3Object(key);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("account deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
