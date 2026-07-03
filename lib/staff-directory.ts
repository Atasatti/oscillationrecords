import { prisma } from "@/lib/prisma";
import { ADMIN_EMAILS } from "@/lib/auth-session";
import { STAFF_ROLES, isStaffRole, type StaffRole } from "@/lib/permissions";

/**
 * The label's staff directory: bootstrap owners (from ADMIN_EMAILS) + every user
 * holding a staff role. Shared by the owner-only management endpoint
 * (/api/admin/users) and the staff-readable picker endpoint (/api/admin/staff),
 * so "who's on the team" has one definition.
 */
export type StaffEntry = {
  id: string | null;
  email: string;
  name: string | null;
  /** Admin-set display nickname, preferred over `name` when set (e.g. two "Ben"s). */
  nickname: string | null;
  image: string | null;
  /** Staff role. Bootstrap accounts are always "admin" (owner). */
  role: StaffRole;
  /** Bootstrap (code-level owner) — can't be edited/removed from the UI. */
  locked: boolean;
};

export async function getStaffDirectory(): Promise<StaffEntry[]> {
  const bootstrapSet = new Set(ADMIN_EMAILS.map((e) => e.toLowerCase()));

  const [staffUsers, bootstrapUsers] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      select: { id: true, name: true, nickname: true, email: true, image: true, role: true },
    }),
    prisma.user.findMany({
      where: { email: { in: [...ADMIN_EMAILS] } },
      select: { id: true, name: true, nickname: true, email: true, image: true },
    }),
  ]);
  const byEmail = new Map(bootstrapUsers.map((u) => [(u.email || "").toLowerCase(), u]));

  const map = new Map<string, StaffEntry>();
  // Bootstrap owners first (locked, always "admin").
  for (const email of ADMIN_EMAILS) {
    const u = byEmail.get(email.toLowerCase());
    map.set(email.toLowerCase(), {
      id: u?.id ?? null,
      email,
      name: u?.name ?? null,
      nickname: u?.nickname ?? null,
      image: u?.image ?? null,
      role: "admin",
      locked: true,
    });
  }
  // Role-granted staff (editable), skipping any that are also bootstrap.
  for (const u of staffUsers) {
    const e = (u.email || "").toLowerCase();
    if (!e || bootstrapSet.has(e) || map.has(e)) continue;
    const role: StaffRole = isStaffRole(u.role) ? u.role : "admin";
    map.set(e, {
      id: u.id,
      email: u.email!,
      name: u.name,
      nickname: u.nickname,
      image: u.image,
      role,
      locked: false,
    });
  }

  return [...map.values()];
}
