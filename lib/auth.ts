import NextAuth, { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth-session";

interface ExtendedToken extends JWT {
  role?: string;
  /** Our Mongo User.id — NOT token.sub (which is the Google OAuth subject). */
  uid?: string;
  /** epoch ms of the last time `role` was re-read from the database. */
  roleCheckedAt?: number;
  [key: string]: unknown;
}

// How long the JWT's cached `role` may go without being re-read. The role used to
// be written once at sign-in and never refreshed, so a 30-day session kept
// asserting "admin" for a month after the account was demoted. Authorization
// itself doesn't depend on this — lib/auth-guard.ts and lib/page-guard.ts re-read
// the role from the database on every sensitive read, write and page render — but
// a stale claim still drove the middleware's page gating and the client's admin
// nav, so bound it to minutes instead of a month.
const ROLE_REFRESH_MS = 5 * 60 * 1000;

export const authOptions: AuthOptions = {
  // No database adapter: sessions are stateless JWTs (see `session.strategy`
  // below), and the jwt() callback upserts the user itself. The unused
  // @auth/prisma-adapter dependency was removed 2026-07-24 — it dragged in
  // @auth/core (NextAuth v5), whose critical OAuth advisories showed up in
  // `npm audit` for a package this app never actually loaded.
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  debug: process.env.NODE_ENV === "development",
  callbacks: {
    async jwt({ token, account, user }) {
      const extendedToken = token as ExtendedToken;

      if (user?.email) {
        extendedToken.email = user.email;
      }

      // On initial sign in: persist the Google user to the DB (so APIs can find
      // them) and capture their authorization role for the session token.
      //
      // NOTE: we deliberately do NOT store Google access/refresh tokens. Nothing
      // server-side uses them (no Google API calls), and keeping them only invited
      // a per-session-refresh loop (expiresAt was never advanced on failure) plus
      // a credential-leak risk. Login uses the identity (email/role) only.
      if (account && user?.email) {
        try {
          // Did this email already have an account? Determines a brand-new signup,
          // which triggers the one-time newsletter prompt.
          const existing = await prisma.user.findUnique({
            where: { email: user.email },
            select: { id: true },
          });
          const dbUser = await prisma.user.upsert({
            where: { email: user.email },
            create: {
              email: user.email,
              name: user.name ?? null,
              image: user.image ?? null,
            },
            update: {
              name: user.name ?? null,
              image: user.image ?? null,
            },
          });
          extendedToken.role = dbUser.role ?? undefined;
          extendedToken.roleCheckedAt = Date.now();
          // Persist OUR Mongo user id on the token so session.user.id and every
          // identity/ownership check use it (token.sub is the Google OAuth subject).
          extendedToken.uid = dbUser.id;

          // Brand-new account → flag it so the client shows a one-time newsletter
          // prompt after signup. Stored as a raw field (no schema change — mirrors
          // lib/page-media) and best-effort: it must never block sign-in.
          if (!existing) {
            try {
              await prisma.$runCommandRaw({
                update: "User",
                updates: [
                  {
                    q: { email: user.email },
                    u: { $set: { newsletterPromptPending: true } },
                  },
                ],
              });
            } catch (e) {
              console.error("Auth: failed to set newsletter prompt flag", e);
            }
          }
        } catch (e) {
          console.error("Auth: failed to sync user to DB", e);
        }
      }

      // Re-read the role when it's gone stale, and backfill uid for tokens minted
      // before we started storing it (existing 30-day sessions). Both are the same
      // single-document lookup, so they share one query. A failed read leaves the
      // cached values in place — this callback must never break sign-in, and the
      // authorization guards do their own fail-closed DB check regardless.
      const email = typeof extendedToken.email === "string" ? extendedToken.email : null;
      const roleStale =
        typeof extendedToken.roleCheckedAt !== "number" ||
        Date.now() - extendedToken.roleCheckedAt > ROLE_REFRESH_MS;
      if (email && (roleStale || !extendedToken.uid)) {
        try {
          const u = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true },
          });
          if (u) {
            extendedToken.uid = u.id;
            extendedToken.role = u.role ?? undefined;
            extendedToken.roleCheckedAt = Date.now();
          }
        } catch (e) {
          console.error("Auth: failed to refresh user role / id", e);
        }
      }

      return token;
    },
    async session({ session, token }) {
      const extendedToken = token as ExtendedToken;
      if (session.user) {
        // Our Mongo user id (uid); fall back to sub only if a token predates the
        // backfill and its user can't be resolved, so id is never undefined.
        session.user.id = (extendedToken.uid as string) ?? (extendedToken.sub as string);
        session.user.role = (extendedToken.role as string) ?? "user";
        // Single client-visible admin flag: bootstrap email OR role === "admin".
        session.user.isAdmin =
          isAdminEmail(extendedToken.email as string) || extendedToken.role === "admin";
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
