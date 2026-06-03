import NextAuth, { AuthOptions, Session, JWT } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";

interface ExtendedToken extends JWT {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
  email?: string;
  [key: string]: unknown;
}

async function refreshGoogleAccessToken(token: ExtendedToken): Promise<JWT> {
  try {
    if (!token.refreshToken) return token;

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken as string,
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to refresh Google access token:", response.status, errorText);
      return { ...token, error: "RefreshAccessTokenError" } as JWT;
    }

    const refreshed = await response.json();

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    } as JWT;
  } catch (e) {
    console.error("Error refreshing access token:", e);
    return { ...token, error: "RefreshAccessTokenError" } as JWT;
  }
}

// Determine if we're using HTTPS
const isProduction = process.env.NODE_ENV === "production";
const isHttps = process.env.NEXTAUTH_URL?.startsWith("https://") ?? isProduction;

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
  useSecureCookies: isHttps,
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isHttps,
        domain: process.env.NEXTAUTH_COOKIE_DOMAIN || undefined,
      },
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        sameSite: "lax",
        path: "/",
        secure: isHttps,
        domain: process.env.NEXTAUTH_COOKIE_DOMAIN || undefined,
      },
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isHttps,
        domain: process.env.NEXTAUTH_COOKIE_DOMAIN || undefined,
      },
    },
  },
  callbacks: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, account, user }): Promise<any> {
      const extendedToken = token as ExtendedToken;
      // On initial sign in: persist Google user to DB and store email in token
      if (account && user?.email) {
        try {
          await prisma.user.upsert({
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
        } catch (e) {
          console.error("Auth: failed to sync user to DB", e);
        }
        extendedToken.accessToken = account.access_token;
        extendedToken.refreshToken = account.refresh_token ?? extendedToken.refreshToken;
        // account.expires_at is in seconds; normalize to ms
        extendedToken.expiresAt = account.expires_at ? account.expires_at * 1000 : Date.now() + 60 * 60 * 1000;
        extendedToken.email = user.email;
        return extendedToken;
      }

      // If token is near expiry (< 60s), try to refresh
      if (extendedToken.expiresAt && Date.now() > extendedToken.expiresAt - 60 * 1000) {
        return await refreshGoogleAccessToken(extendedToken);
      }

      return token;
    },

    async session({ session, token }) {
      const extendedToken = token as ExtendedToken;
      if (session.user) {
        session.user.id = extendedToken.sub as string;
        session.user.email = extendedToken.email as string;
      }

      (session as Session & { accessToken?: string; refreshToken?: string; expiresAt?: number }).accessToken = extendedToken.accessToken;
      (session as Session & { accessToken?: string; refreshToken?: string; expiresAt?: number }).refreshToken = extendedToken.refreshToken;
      (session as Session & { accessToken?: string; refreshToken?: string; expiresAt?: number }).expiresAt = extendedToken.expiresAt;

      return session;
    },

    // CRITICAL: Validate sign-in
    async signIn({ user }) {
      if (!user?.email) {
        console.error("SignIn callback: No email provided");
        return false;
      }
      console.log(`User ${user.email} signed in successfully`);
      return true;
    },

    // CRITICAL: Handle post-login redirect properly
    async redirect({ url, baseUrl }) {
      // If callback URL is a relative path, use it
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      
      // If callback URL is on the same origin, use it
      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url;
      } catch {
        // Invalid URL, fall through
      }
      
      // Default redirect after successful login
      return `${baseUrl}/admin`;
    },
  },
};

export default NextAuth(authOptions);
