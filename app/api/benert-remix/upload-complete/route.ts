import { NextRequest, NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-guard";
import { rateLimit } from "@/lib/rate-limit";
import {
  S3_BUCKET,
  benertUserKeyPrefix,
  deleteS3Object,
  isAudioContentType,
  isOwnBucketUrl,
  s3Client,
  s3Configured,
} from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Generous cap for a single audio remix (a long lossless WAV can be large).
const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

// POST /api/benert-remix/upload-complete - Save uploaded file URL
export async function POST(request: NextRequest) {
  try {
    // Requires a live account: this used to CREATE the user row when none was
    // found, so a stale token from a deleted account would resurrect it — and
    // register a competition entry against the resurrected row.
    const guard = await requireUser(request);
    if (!guard.ok) return guard.response;
    const token = guard.token;

    // Rate-limit per user: this route does an S3 HEAD plus several DB ops, so it
    // must not be replayable unthrottled.
    const rl = rateLimit(`benertupload:${token.sub}`, 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

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
    const ownPrefix = benertUserKeyPrefix(token.sub);
    const objectKey = decodeURIComponent(new URL(fileURL).pathname.replace(/^\/+/, ""));
    if (!ownPrefix || !objectKey.startsWith(ownPrefix)) {
      return NextResponse.json({ error: "Invalid fileURL" }, { status: 400 });
    }

    // Confirm the uploaded object is audio and within the size cap. Fails CLOSED:
    // if S3 metadata can't be read we reject (ask the client to retry) rather than
    // accept an unverified file — otherwise the audio-only / size guarantees are
    // bypassed simply by making HeadObject error. The app's IAM role signs the
    // PutObject for this bucket, so it must also be granted s3:HeadObject.
    if (s3Configured() && s3Client) {
      try {
        const head = await s3Client.send(
          new HeadObjectCommand({ Bucket: S3_BUCKET, Key: objectKey })
        );
        if (typeof head.ContentLength === "number" && head.ContentLength > MAX_AUDIO_BYTES) {
          // Sweep the rejected object instead of leaving it in the bucket — an
          // oversized upload that's validated-but-kept is exactly the unswept-object
          // storage abuse the audit flagged (#6). Mirrors the assets route.
          await deleteS3Object(objectKey);
          return NextResponse.json({ error: "File is too large" }, { status: 400 });
        }
        if (head.ContentType && !isAudioContentType(head.ContentType)) {
          await deleteS3Object(objectKey);
          return NextResponse.json({ error: "Uploaded file must be audio" }, { status: 400 });
        }
      } catch (e) {
        console.error("upload-complete: HEAD validation failed", e);
        return NextResponse.json(
          { error: "Could not verify the uploaded file. Please try again." },
          { status: 502 }
        );
      }
    }

    // Cap the entrant-controlled name so it can't be stored unbounded (mirrors the
    // analytics beacons' name caps).
    const trimmedReleaseName =
      typeof releaseName === "string" ? releaseName.trim().slice(0, 200) : "";
    if (!trimmedReleaseName) {
      return NextResponse.json(
        { error: "Release name is required" },
        { status: 400 }
      );
    }

    const entry = await prisma.benertRemixEntry.findUnique({
      where: { userId: guard.userId },
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
      where: { userId: guard.userId },
      create: {
        userId: guard.userId,
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
