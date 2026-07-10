import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { getAuthToken } from "@/lib/auth-session";
import { resolveUserId } from "@/lib/current-user";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { headS3Object, isOwnBucketUrl } from "@/lib/s3";
import {
  CONTACT_NAME_MAX,
  CONTACT_EMAIL_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_EMAIL_RE,
  MAX_CONTACT_ATTACHMENTS,
  MAX_CONTACT_ATTACHMENT_BYTES,
  isAllowedContactAttachmentType,
  cleanContactField,
  type ContactAttachment,
} from "@/lib/contact-input";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

    // Honeypot: the form renders a hidden "company" field a human never sees or
    // fills. A non-empty value means a bot — answer with a fake success and drop
    // it silently, so the trap isn't revealed.
    if (cleanContactField(body?.company, 100)) {
      return NextResponse.json({ ok: true });
    }

    const message = cleanContactField(body?.message, CONTACT_MESSAGE_MAX);
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Please enter a message." },
        { status: 400 }
      );
    }

    // Identity: a signed-in sender is taken AUTHORITATIVELY from their session, so
    // name/email can't be faked or duplicated. Anonymous visitors supply the
    // fields, validated as before.
    const token = await getAuthToken(request).catch(() => null);
    const sessionEmail =
      typeof token?.email === "string" ? token.email.trim().toLowerCase() : "";
    const isAuthed = CONTACT_EMAIL_RE.test(sessionEmail);

    let name: string;
    let email: string;
    let userId: string | null = null;

    if (isAuthed) {
      email = sessionEmail.slice(0, CONTACT_EMAIL_MAX);
      name =
        cleanContactField(token?.name, CONTACT_NAME_MAX) ||
        cleanContactField(body?.name, CONTACT_NAME_MAX) ||
        email.split("@")[0];
      userId = await resolveUserId(token);
    } else {
      name = cleanContactField(body?.name, CONTACT_NAME_MAX);
      email = cleanContactField(body?.email, CONTACT_EMAIL_MAX).toLowerCase();
      if (!name || !email) {
        return NextResponse.json(
          { ok: false, error: "Name, email, and message are all required." },
          { status: 400 }
        );
      }
      if (!CONTACT_EMAIL_RE.test(email)) {
        return NextResponse.json(
          { ok: false, error: "Please enter a valid email address." },
          { status: 400 }
        );
      }
    }

    // Attachments — each must be one of OUR S3 objects under `contact/`, and is
    // HEAD-validated for its real size + type rather than trusting client claims.
    // Fail closed: a claimed-but-unverifiable attachment rejects the submission.
    const rawAttachments = Array.isArray(body?.attachments)
      ? body.attachments.slice(0, MAX_CONTACT_ATTACHMENTS)
      : [];
    const attachments: ContactAttachment[] = [];
    for (const item of rawAttachments) {
      const url = typeof item?.url === "string" ? item.url : "";
      let key = "";
      try {
        // Decode the path back into the real object key. publicFileUrl() builds the
        // URL by raw interpolation, so spaces/unicode common in audio filenames sit
        // un-escaped; new URL() then percent-encodes them in .pathname. Without the
        // decode, "contact/…/My Song.mp3" is HEAD-checked as "…/My%20Song.mp3",
        // which 404s and wrongly trips "Couldn't verify an attachment" for a valid
        // upload. Mirrors app/api/benert-remix/upload-complete/route.ts.
        key = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
      } catch {
        key = "";
      }
      if (!isOwnBucketUrl(url) || !key.startsWith("contact/")) {
        return NextResponse.json(
          { ok: false, error: "One of your attachments is invalid." },
          { status: 400 }
        );
      }
      const head = await headS3Object(key);
      if (!head) {
        return NextResponse.json(
          { ok: false, error: "Couldn't verify an attachment — please re-add it and try again." },
          { status: 400 }
        );
      }
      if (head.size > MAX_CONTACT_ATTACHMENT_BYTES) {
        return NextResponse.json(
          { ok: false, error: "An attachment is larger than the 100 MB limit." },
          { status: 400 }
        );
      }
      if (!isAllowedContactAttachmentType(head.contentType)) {
        return NextResponse.json(
          { ok: false, error: "An attachment has an unsupported file type." },
          { status: 400 }
        );
      }
      const rawName =
        typeof item?.name === "string" && item.name.trim()
          ? item.name.trim()
          : key.split("/").pop() || "attachment";
      attachments.push({
        name: rawName.slice(0, 200),
        url,
        size: head.size,
        type: head.contentType,
      });
    }

    await prisma.contactMessage.create({
      data: {
        name,
        email,
        message,
        ...(userId ? { userId } : {}),
        ...(attachments.length
          ? { attachments: attachments as unknown as Prisma.InputJsonValue }
          : {}),
      },
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
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;

  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return NextResponse.json({ messages });
}
