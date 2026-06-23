import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// DELETE /api/account — GDPR right to erasure. Deletes the signed-in user; the
// schema cascades their accounts, sessions, profile, listening history, and
// competition entry. The newsletter subscription is keyed by email (not a
// relation), so we remove it explicitly. The client signs the user out after.
export async function DELETE(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;

  // token.sub is the OAuth subject, NOT our Mongo user id — delete by email (the
  // unique login key); the schema cascade removes accounts/sessions/profile/
  // history/entry. (Deleting by token.sub threw "Malformed ObjectID".)
  const email = guard.token.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "No account email on session" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.newsletterSubscriber.deleteMany({ where: { email } }),
      prisma.user.delete({ where: { email } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("account deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
