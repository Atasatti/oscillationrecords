import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import {
  S3_BUCKET,
  isAudioContentType,
  isOwnBucketUrl,
  s3Client,
  s3Configured,
} from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_UPLOAD_PREFIX = "benert-remix/";
// Generous cap for a single audio remix (a long lossless WAV can be large).
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

// POST /api/benert-remix/upload-complete - Save uploaded file URL
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.sub || !token?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let user = await prisma.user.findUnique({
      where: { email: token.email as string },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: token.email as string,
          name: (token.name as string) ?? null,
          image: (token.picture as string) ?? null,
        },
      });
    }

    const body = await request.json();
    const { fileURL, releaseName } = body;

    if (!fileURL || typeof fileURL !== "string") {
      return NextResponse.json(
        { error: "fileURL is required" },
        { status: 400 }
      );
    }

    // Only accept URLs that point at our own S3 bucket (set by the presign step),
    // so an arbitrary/malicious link can't be stored and later shown to the admin.
    if (!isOwnBucketUrl(fileURL)) {
      return NextResponse.json(
        { error: "Invalid fileURL" },
        { status: 400 }
      );
    }

    // Confine the URL to THIS user's own upload prefix (presign issues
    // `benert-remix/<userId>/…`). Without this, an entrant could submit a link to
    // any object in the bucket (an admin catalog track, another user's file).
    const safeSub = String(token.sub || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 64);
    const objectKey = decodeURIComponent(new URL(fileURL).pathname.replace(/^\/+/, ""));
    if (!safeSub || !objectKey.startsWith(`${PUBLIC_UPLOAD_PREFIX}${safeSub}/`)) {
      return NextResponse.json({ error: "Invalid fileURL" }, { status: 400 });
    }

    // Best-effort: confirm the uploaded object is audio and within the size cap.
    // Fails CLOSED on a confirmed violation, OPEN if S3 metadata can't be read
    // (e.g. HeadObject not permitted) so a misconfigured IAM policy can't block
    // legitimate entries.
    if (s3Configured() && s3Client) {
      try {
        const head = await s3Client.send(
          new HeadObjectCommand({ Bucket: S3_BUCKET, Key: objectKey })
        );
        if (typeof head.ContentLength === "number" && head.ContentLength > MAX_AUDIO_BYTES) {
          return NextResponse.json({ error: "File is too large" }, { status: 400 });
        }
        if (head.ContentType && !isAudioContentType(head.ContentType)) {
          return NextResponse.json({ error: "Uploaded file must be audio" }, { status: 400 });
        }
      } catch (e) {
        console.warn("upload-complete: could not HEAD object for validation", e);
      }
    }

    const trimmedReleaseName = typeof releaseName === "string" ? releaseName.trim() : "";
    if (!trimmedReleaseName) {
      return NextResponse.json(
        { error: "Release name is required" },
        { status: 400 }
      );
    }

    const entry = await prisma.benertRemixEntry.findUnique({
      where: { userId: user.id },
    });

    if (entry?.uploadedFileUrl) {
      return NextResponse.json(
        { error: "You have already submitted your remix" },
        { status: 400 }
      );
    }

    // Check competition still active
    const competition = await prisma.benertRemixCompetition.findFirst({
      orderBy: { startedAt: "desc" },
    });

    if (!competition || competition.endsAt <= new Date()) {
      return NextResponse.json(
        { error: "Competition has ended" },
        { status: 400 }
      );
    }

    await prisma.benertRemixEntry.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        releaseName: trimmedReleaseName,
        uploadedFileUrl: fileURL,
      },
      update: {
        releaseName: trimmedReleaseName,
        uploadedFileUrl: fileURL,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Benert remix upload-complete error:", error);
    return NextResponse.json(
      { error: "Failed to save upload" },
      { status: 500 }
    );
  }
}
