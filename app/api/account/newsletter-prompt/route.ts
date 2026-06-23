import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One-time, post-signup newsletter prompt. A brand-new account is flagged at
// sign-in with a raw `newsletterPromptPending` field (see lib/auth.ts — kept off
// the Prisma schema, mirroring lib/page-media). GET reports whether to show the
// prompt; POST records the answer (optionally subscribing) and clears the flag so
// it only ever appears once.

type RawFind = { cursor?: { firstBatch?: Array<Record<string, unknown>> } };

export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    const res = (await prisma.$runCommandRaw({
      find: "User",
      filter: { email: String(guard.token.email) },
      projection: { newsletterPromptPending: 1 },
      limit: 1,
    })) as unknown as RawFind;
    const doc = res?.cursor?.firstBatch?.[0];
    return NextResponse.json({ prompt: doc?.newsletterPromptPending === true });
  } catch (error) {
    console.error("newsletter-prompt status error:", error);
    return NextResponse.json({ prompt: false });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const subscribe = body?.subscribe === true;

    if (subscribe) {
      const email = String(guard.token.email ?? "").trim().toLowerCase();
      await prisma.newsletterSubscriber.upsert({
        where: { email },
        create: { email },
        update: {},
      });
    }

    // Clear the flag (match the stored email exactly) so the prompt never recurs.
    await prisma.$runCommandRaw({
      update: "User",
      updates: [
        {
          q: { email: String(guard.token.email) },
          u: { $set: { newsletterPromptPending: false } },
        },
      ],
    });

    return NextResponse.json({ ok: true, subscribed: subscribe });
  } catch (error) {
    console.error("newsletter-prompt answer error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
