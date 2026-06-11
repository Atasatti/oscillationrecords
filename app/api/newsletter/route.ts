import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    // Public, unauthenticated endpoint — throttle per IP to limit signup flooding.
    const limit = rateLimit(`newsletter:${clientIp(request)}`, 5, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const body = await request.json();
    const raw = typeof body.email === "string" ? body.email.trim() : "";
    const email = raw.toLowerCase();

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    try {
      await prisma.newsletterSubscriber.create({
        data: { email },
      });
      return NextResponse.json({ ok: true, created: true });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return NextResponse.json({ ok: true, created: false });
      }
      throw e;
    }
  } catch (error) {
    console.error("Newsletter signup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
