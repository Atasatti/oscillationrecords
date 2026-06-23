import NextAuth, { AuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

interface ExtendedToken extends JWT {
  role?: string;
  [key: string]: unknown;
}

export const authOptions: AuthOptions = {
  // adapter: PrismaAdapter(prisma), // Temporarily disabled to fix session issues
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

      return token;
    },
    async session({ session, token }) {
      const extendedToken = token as ExtendedToken;
      if (session.user) {
        session.user.id = extendedToken.sub as string;
        session.user.role = (extendedToken.role as string) ?? "user";
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
