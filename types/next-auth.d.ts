import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Authorization role mirrored from the JWT ("admin" | "user"). */
      role?: string;
      /** True for bootstrap admins OR role === "admin". Computed in the session
       * callback so the client can show the "Admin" link without knowing the
       * bootstrap allowlist. */
      isAdmin?: boolean;
    } & DefaultSession["user"];
  }
}

// Authorization role lives in the server-side JWT (set in the jwt callback),
// never on the client session. (In v4 the JWT interface is in next-auth/jwt.)
declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
  }
}
