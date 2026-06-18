import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Authorization role mirrored from the JWT ("admin" | "user"). */
      role?: string;
    } & DefaultSession["user"];
  }
}

// Google OAuth tokens + role live only in the server-side JWT, never on the
// client session. (In v4 the JWT interface is in the next-auth/jwt module.)
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    role?: string;
  }
}
