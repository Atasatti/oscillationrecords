import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { isOwnBucketUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
