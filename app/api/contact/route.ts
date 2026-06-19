import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Basic shape check — not full RFC validation, just enough to reject obvious junk.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX = { name: 200, email: 320, message: 5000 } as const;

/** Trim a field to a string and cap its length; returns "" for non-strings. */
function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// POST /api/contact — public "Contact Us" submission. Stored for admin follow-up.
export async function POST(request: NextRequest) {
  // Per-IP throttle so the form can't be used to flood the collection.
  const rl = rateLimit(`contact:${clientIp(request)}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many messages. Please try again in a minute." },
      { status: 429 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    const name = clean(body?.name, MAX.name);
    const email = clean(body?.email, MAX.email);
    const message = clean(body?.message, MAX.message);

    if (!name || !email || !message) {
      return NextResponse.json(
        { ok: false, error: "Name, email, and message are all required." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    await prisma.contactMessage.create({
      data: { name, email: email.toLowerCase(), message },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contact submission error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}

// GET /api/contact — admin-only list of submissions, newest first.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ messages });
}
