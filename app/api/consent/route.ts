import { NextRequest, NextResponse } from "next/server";
import {
  CONSENT_COOKIE,
  VISITOR_COOKIE,
  CONSENT_MAX_AGE,
  VISITOR_MAX_AGE,
} from "@/lib/consent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/consent — record the visitor's cookie choice.
// { analytics: true }  -> consent "all", set/keep the anonymous visitor id
// { analytics: false } -> consent "essential", clear the visitor id
export async function POST(request: NextRequest) {
  let analytics = false;
  try {
    const body = await request.json();
    analytics = Boolean(body?.analytics);
  } catch {
    /* default deny */
  }

  const secure = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true, analytics });

  res.cookies.set(CONSENT_COOKIE, analytics ? "all" : "essential", {
    httpOnly: false, // the banner reads this to know a choice was made
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: CONSENT_MAX_AGE,
  });

  if (analytics) {
    // Only mint a visitor id if there isn't one already (keeps the id stable).
    const existing = request.cookies.get(VISITOR_COOKIE)?.value;
    const vid = existing && existing.length >= 8 ? existing : crypto.randomUUID();
    res.cookies.set(VISITOR_COOKIE, vid, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: VISITOR_MAX_AGE,
    });
  } else {
    // Withdraw: stop anonymous tracking by removing the id.
    res.cookies.set(VISITOR_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 0,
    });
  }

  return res;
}
