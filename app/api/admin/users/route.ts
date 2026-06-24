import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { ADMIN_EMAILS } from "@/lib/auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminEntry = {
  id: string | null;
  email: string;
  name: string | null;
  image: string | null;
  /** Bootstrap (code-level) admin — can't be removed from the UI. */
  locked: boolean;
};

// GET /api/admin/users — current admins: the bootstrap allowlist + any user with
// role "admin". Bootstrap entries are "locked" (managed in code, not removable).
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const bootstrapSet = new Set(ADMIN_EMAILS.map((e) => e.toLowerCase()));

    const [roleAdmins, bootstrapUsers] = await Promise.all([
      prisma.user.findMany({
        where: { role: "admin" },
        select: { id: true, name: true, email: true, image: true },
      }),
      prisma.user.findMany({
        where: { email: { in: [...ADMIN_EMAILS] } },
        select: { id: true, name: true, email: true, image: true },
      }),
    ]);
    const byEmail = new Map(bootstrapUsers.map((u) => [(u.email || "").toLowerCase(), u]));

    const map = new Map<string, AdminEntry>();
    // Bootstrap admins first (locked).
    for (const email of ADMIN_EMAILS) {
      const u = byEmail.get(email.toLowerCase());
      map.set(email.toLowerCase(), {
        id: u?.id ?? null,
        email,
        name: u?.name ?? null,
        image: u?.image ?? null,
        locked: true,
      });
    }
    // Role-granted admins (removable), skipping any that are also bootstrap.
    for (const u of roleAdmins) {
      const e = (u.email || "").toLowerCase();
      if (!e || bootstrapSet.has(e) || map.has(e)) continue;
      map.set(e, { id: u.id, email: u.email!, name: u.name, image: u.image, locked: false });
    }

    return NextResponse.json(
      { admins: [...map.values()] },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("admin users GET error:", e);
    return NextResponse.json({ error: "Failed to load admins" }, { status: 500 });
  }
}

// POST /api/admin/users { email } — grant admin. Promotes an existing user or
// pre-creates one keyed by email (sign-in matches by email, so they become admin
// the first time they sign in with that Google account).
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, role: "admin" },
      update: { role: "admin" },
      select: { id: true, name: true, email: true, image: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    console.error("admin users POST error:", e);
    return NextResponse.json({ error: "Failed to add admin" }, { status: 500 });
  }
}
