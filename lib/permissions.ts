// Isomorphic role → permission policy. No DB access and no server-only imports,
// so it is safe to import from edge middleware, server route handlers, AND client
// components alike. This module is the pure *policy* map only — the authoritative,
// revocation-aware *enforcement* lives in lib/auth-guard.ts (requirePermission),
// which re-reads the role from the database on every mutating request.
//
// Backwards compatibility: the pre-existing "admin" role is the OWNER role (full
// access), kept as-is so every current admin stays an owner with zero migration.
// Bootstrap admins (lib/auth-session.ts ADMIN_EMAILS) are also treated as owners.

export type Permission =
  | "catalog:read"
  | "catalog:write"
  | "outreach:read"
  | "outreach:write"
  | "analytics:read"
  | "analytics:write"
  | "settings:write"
  | "users:write";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "catalog:read",
  "catalog:write",
  "outreach:read",
  "outreach:write",
  "analytics:read",
  "analytics:write",
  "settings:write",
  "users:write",
];

// Values stored in User.role for staff. "admin" == OWNER (full access).
export type StaffRole = "admin" | "catalog" | "promotion" | "analytics" | "viewer";

export const OWNER_ROLE: StaffRole = "admin";

// Every role a staff member can hold. Non-staff users have role "user"/null and
// never reach the admin area.
export const STAFF_ROLES: readonly StaffRole[] = [
  "admin",
  "catalog",
  "promotion",
  "analytics",
  "viewer",
];

// Scoped roles only (owner excluded) — the assignable options shown in the UI
// alongside "Owner", which is granted separately.
export const SCOPED_ROLES: readonly StaffRole[] = ["catalog", "promotion", "analytics", "viewer"];

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Owner (full access)",
  catalog: "Catalog editor",
  promotion: "Outreach / Promotion",
  analytics: "Analytics (read-only)",
  viewer: "Read-only",
};

export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  admin: "Full access to everything, including user management, roles and settings.",
  catalog: "Manage releases, artists, press, tracks and site content. Read analytics.",
  promotion: "Manage contacts, pitches, tasks, messages and subscribers. Read analytics.",
  analytics: "View live data and error logs. Cannot change anything.",
  viewer: "View the whole admin — catalog, outreach and analytics. Change nothing.",
};

// "*" = every permission (owner). Scoped roles list their explicit grants.
const ROLE_PERMISSIONS: Record<StaffRole, readonly (Permission | "*")[]> = {
  admin: ["*"],
  catalog: ["catalog:read", "catalog:write", "analytics:read"],
  promotion: ["outreach:read", "outreach:write", "analytics:read"],
  analytics: ["analytics:read"],
  viewer: ["catalog:read", "outreach:read", "analytics:read"],
};

export function isStaffRole(role?: string | null): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role);
}

/** Whether a role grants a permission. Unknown / non-staff roles grant nothing. */
export function roleCan(role: string | null | undefined, perm: Permission): boolean {
  if (!isStaffRole(role)) return false;
  const grants = ROLE_PERMISSIONS[role];
  return grants.includes("*") || grants.includes(perm);
}

/** The full permission set a role grants (owner → all). For UI + debugging. */
export function permissionsForRole(role: string | null | undefined): Permission[] {
  if (!isStaffRole(role)) return [];
  const grants = ROLE_PERMISSIONS[role];
  if (grants.includes("*")) return [...ALL_PERMISSIONS];
  return grants.filter((p): p is Permission => p !== "*");
}
