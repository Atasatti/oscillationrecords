import type { NextRequest } from "next/server";
import { requireAdmin, requirePermission, requireUser, type Guard } from "@/lib/auth-guard";
import type { Permission } from "@/lib/permissions";
import { benertUserKeyPrefix } from "@/lib/s3-url";

/**
 * Per-prefix authorization for reading an S3 object through the download shim
 * (audit #1). The bucket no longer serves the private prefixes anonymously, so
 * THIS is the access-control point for every sensitive file: contracts, DAM
 * masters/stems, contact-form attachments, task attachments and competition
 * entries. Knowing an object key must never be enough — the caller has to hold
 * the permission that the owning admin surface requires.
 *
 * Server-only (imports the DB-backed guards); the pure key classification lives
 * in lib/s3-url.ts so client components can pick the right href.
 */

// Longest prefix wins, so `releases/agreements/` is matched before any broader
// `releases/` rule could be added.
const KEY_PERMISSIONS: readonly { prefix: string; permission: Permission }[] = [
  { prefix: "releases/agreements/", permission: "catalog:read" },
  { prefix: "task-attachments/", permission: "outreach:read" },
  { prefix: "tracks/stems/", permission: "catalog:read" },
  { prefix: "documents/", permission: "catalog:read" },
  { prefix: "assets/", permission: "catalog:read" },
  { prefix: "contact/", permission: "outreach:read" },
];

/** The permission required to read `key`. Public site media (covers, artist and
 *  press images, released audio) still needs catalog:read here because the shim
 *  is an admin-surface convenience — the object itself is anonymously readable
 *  at its bucket URL. */
export function permissionForKey(key: string): Permission {
  const match = KEY_PERMISSIONS.filter((r) => key.startsWith(r.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length
  )[0];
  return match?.permission ?? "catalog:read";
}

/**
 * Authorize reading one object. Competition entries are readable by the entrant
 * who uploaded them (their own submission) or by an admin reviewing entries;
 * every other prefix maps to a staff permission.
 */
export async function authorizeAssetKey(request: NextRequest, key: string): Promise<Guard> {
  if (key.startsWith("benert-remix/")) {
    const user = await requireUser(request);
    if (user.ok) {
      const own = benertUserKeyPrefix(user.token.sub);
      if (own && key.startsWith(own)) return user;
    }
    // Not the owner (or not signed in) — only an admin reviews other entries.
    return requireAdmin(request);
  }
  return requirePermission(request, permissionForKey(key));
}
