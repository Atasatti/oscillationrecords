import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Newsletter subscription is tied to the signed-in account's (Google-verified)
// email — we never accept a manually-typed address, so the list can't be polluted
// with fake or mistyped emails (which is why no SMTP/DNS verification is needed).
//   GET    — is the signed-in account subscribed?
//   POST   — subscribe the account email
//   DELETE — unsubscribe the account email
// All three require a signed-in user and act only on that user's own email.

/** The signed-in account's email, normalised to match the unique index. */
function accountEmail(token: { email?: unknown }): string {
  return String(token.email ?? "").trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    const existing = await prisma.newsletterSubscriber.findUnique({
      where: { email: accountEmail(guard.token) },
      select: { email: true },
    });
    return NextResponse.json({ subscribed: Boolean(existing) });
  } catch (error) {
    console.error("Newsletter status error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    const email = accountEmail(guard.token);
    // Idempotent: re-subscribing is a no-op, never a duplicate-key error.
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    return NextResponse.json({ subscribed: true });
  } catch (error) {
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    // deleteMany so unsubscribing when not subscribed is a harmless no-op.
    await prisma.newsletterSubscriber.deleteMany({
      where: { email: accountEmail(guard.token) },
    });
    return NextResponse.json({ subscribed: false });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
