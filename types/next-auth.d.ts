import NextAuth, { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  // Google OAuth tokens live only in the server-side JWT, never on the client session.
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  }
}
