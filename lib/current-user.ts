import { prisma } from "@/lib/prisma";

// Resolve the caller's canonical Mongo User.id from an auth token.
//
// IMPORTANT: token.sub is the OAuth (Google) subject, NOT our Mongo user id —
// using it directly against an @db.ObjectId field throws "Malformed ObjectID"
// (see app/api/account/route.ts). So we look the user up by email, matching the
// account routes. Returns null if the token has no email or no matching user.
export async function resolveUserId(
  token: { email?: string | null } | null | undefined
): Promise<string | null> {
  const email = token?.email;
  if (!email) return null;
  const user = await prisma.user
    .findUnique({ where: { email }, select: { id: true } })
    .catch(() => null);
  return user?.id ?? null;
}
