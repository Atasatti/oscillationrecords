import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, isSameOrigin } from "@/lib/auth-guard";
import { deleteS3Object, keyFromOwnBucketUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// DELETE /api/account — GDPR right to erasure. Deletes the signed-in user; the
// schema cascades their accounts, sessions, profile, listening history, and
// competition entry. The newsletter subscription is keyed by email (not a
// relation), so we remove it explicitly. The client signs the user out after.
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

    await prisma.$transaction([
      prisma.newsletterSubscriber.deleteMany({ where: { email } }),
      prisma.user.delete({ where: { email } }),
    ]);

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
