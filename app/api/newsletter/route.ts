import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { validateNewsletterEmail } from "@/lib/newsletter-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    // Honeypot — a hidden field real users never fill. If a bot fills it, pretend
    // success (don't tip it off) but save nothing.
    if (typeof body.company === "string" && body.company.trim() !== "") {
      return NextResponse.json({ ok: true, created: false });
    }

    // Syntax + disposable/fake-domain blocklist + fake-pattern + DNS deliverability.
    const check = await validateNewsletterEmail(body.email);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    const email = check.email;

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
