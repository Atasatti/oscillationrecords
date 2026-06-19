import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

// Demographics are free-form in the DB but the dashboard treats them as enums.
// Validate on write so a client can't store junk/oversized values that then
// surface (and bloat) the admin analytics.
const GENDERS = new Set(["male", "female", "other", "prefer_not_to_say"]);
const AGE_RANGES = new Set(["18-24", "25-34", "35-44", "45-54", "55+"]);

/** Accept a value only if it's in the allowlist, else undefined (left unchanged). */
function enumOrUndefined(value: unknown, allowed: Set<string>): string | undefined {
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

/** Trimmed, length-capped free-text (country/city), else undefined. */
function shortTextOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim().slice(0, 80);
  return t.length ? t : undefined;
}

/** Whole-number age in a human range, else undefined. */
function ageOrUndefined(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : undefined;
}

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/analytics/user-profile - Store or update user demographics
export async function POST(request: NextRequest) {
  try {
    // Safeguard: Ensure NEXTAUTH_SECRET is available
    if (!process.env.NEXTAUTH_SECRET) {
      console.error("NEXTAUTH_SECRET is not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET
    });

    if (!token || !token.sub) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const gender = enumOrUndefined(body.gender, GENDERS);
    const ageRange = enumOrUndefined(body.ageRange, AGE_RANGES);
    const age = ageOrUndefined(body.age);
    const country = shortTextOrUndefined(body.country);
    const city = shortTextOrUndefined(body.city);

    // Find or create user by email
    let user = await prisma.user.findUnique({
      where: { email: token.email as string },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: token.email as string,
          name: token.name as string,
          image: token.picture as string,
        },
      });
    }

    // Upsert user profile
    const profile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        gender: gender || undefined,
        age: age || undefined,
        ageRange: ageRange || undefined,
        country: country || undefined,
        city: city || undefined,
      },
      create: {
        userId: user.id,
        gender: gender || null,
        age: age || null,
        ageRange: ageRange || null,
        country: country || null,
        city: city || null,
      },
    });

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return NextResponse.json(
      { error: "Failed to update user profile" },
      { status: 500 }
    );
  }
}

// GET /api/analytics/user-profile - Get user profile
export async function GET(request: NextRequest) {
  try {
    // Safeguard: Ensure NEXTAUTH_SECRET is available
    if (!process.env.NEXTAUTH_SECRET) {
      console.error("NEXTAUTH_SECRET is not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET
    });

    if (!token || !token.sub) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: token.email as string },
      include: { profile: true },
    });

    if (!user) {
      return NextResponse.json({ profile: null });
    }

    return NextResponse.json({ profile: user.profile });
  } catch (error) {
    console.error("Error getting user profile:", error);
    return NextResponse.json(
      { error: "Failed to get user profile" },
      { status: 500 }
    );
  }
}

