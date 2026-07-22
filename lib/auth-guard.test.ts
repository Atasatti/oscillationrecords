import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// The guards read the JWT via next-auth and the current role via Prisma; both are
// stubbed so the *authorization decision* can be tested without a browser session
// or a database. What's under test is one thing: when the token's cached role and
// the database disagree, the database wins.

const getToken = vi.fn();
const findUnique = vi.fn();

vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => getToken(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

const { isAdminRequest, requireAdmin, requireStaff, requirePermission, requireUser } =
  await import("./auth-guard");

// A bootstrap-allowlisted owner (lib/auth-session.ts ADMIN_EMAILS) — always an
// owner by email, never DB-dependent.
const BOOTSTRAP_EMAIL = "oscillationrecordz@gmail.com";
const req = {} as NextRequest;

/** Sign in as someone whose 30-day JWT still claims `tokenRole`, while the
 *  database now says `dbRole` (null = the row is gone). */
function session(tokenRole: string | undefined, dbRole: string | null, email = "staff@example.com") {
  getToken.mockResolvedValue({ email, sub: "google-sub", role: tokenRole });
  findUnique.mockResolvedValue(dbRole === null ? null : { role: dbRole });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("a demoted owner loses access immediately", () => {
  it("isAdminRequest is false once the DB role is no longer admin", async () => {
    // The exact exposure: the JWT was minted while they were an owner and stays
    // valid for 30 days, so it still says role:"admin". Private catalogue reads
    // (draft releases, UPC / P-line / C-line, ISRC, stems, splits) gate on this.
    session("admin", "user");
    expect(await isAdminRequest(req)).toBe(false);
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("isAdminRequest is false when demoted to a scoped staff role", async () => {
    session("admin", "catalog");
    expect(await isAdminRequest(req)).toBe(false);
  });

  it("isAdminRequest is false when the account has been deleted", async () => {
    session("admin", null);
    expect(await isAdminRequest(req)).toBe(false);
  });

  it("requireAdmin 403s on the same stale token", async () => {
    session("admin", "user");
    const guard = await requireAdmin(req);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(403);
  });

  it("requireStaff 403s once the role is no longer a staff role", async () => {
    session("admin", "user");
    const guard = await requireStaff(req);
    expect(guard.ok).toBe(false);
  });

  it("requirePermission 403s once the role no longer grants it", async () => {
    session("admin", "analytics"); // analytics grants only analytics:read
    const guard = await requirePermission(req, "catalog:read");
    expect(guard.ok).toBe(false);
  });

  it("read and write gates agree — no window where reads outlive writes", async () => {
    session("admin", "user");
    const read = await isAdminRequest(req);
    session("admin", "user");
    const write = await requireAdmin(req);
    expect(read).toBe(false);
    expect(write.ok).toBe(false);
  });
});

describe("a current owner still has access", () => {
  it("isAdminRequest is true when the DB confirms the admin role", async () => {
    session("admin", "admin");
    expect(await isAdminRequest(req)).toBe(true);
  });

  it("bootstrap owners pass without a DB lookup", async () => {
    getToken.mockResolvedValue({ email: BOOTSTRAP_EMAIL, sub: "s" });
    expect(await isAdminRequest(req)).toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("a PROMOTED account is not admin until its token refreshes — deliberately asymmetric", async () => {
    // The check is one-directional on purpose: a token claiming admin is
    // downgraded by the DB, but a token claiming nothing is never upgraded by it.
    // Verifying the other direction would mean a role lookup on every request
    // from every signed-in visitor, including public catalogue pages, to buy
    // nothing security-relevant — this direction fails CLOSED. Promotion lands
    // when the JWT's role refreshes (ROLE_REFRESH_MS in lib/auth.ts, 5 min).
    session(undefined, "admin");
    expect(await isAdminRequest(req)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("a deleted account loses access immediately", () => {
  // Sessions are stateless 30-day JWTs, so deleting the User row can't invalidate
  // the tokens already issued for it. Requiring the row to exist is what makes
  // erasure effective on the next request rather than in up to a month.
  const deletedSession = () => {
    getToken.mockResolvedValue({ email: "gone@example.com", sub: "google-sub" });
    findUnique.mockResolvedValue(null);
  };

  it("requireUser 401s when the user row is gone", async () => {
    deletedSession();
    const guard = await requireUser(req);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });

  it("rejects the same deleted account on every device independently", async () => {
    // The point of the DB check: two other browsers each holding their own valid
    // token are both turned away, with no session store to propagate to.
    for (const device of ["laptop", "phone", "tablet"]) {
      getToken.mockResolvedValue({ email: "gone@example.com", sub: `sub-${device}` });
      findUnique.mockResolvedValue(null);
      const guard = await requireUser(req);
      expect(guard.ok, device).toBe(false);
    }
  });

  it("a deleted account that was an owner also loses admin access", async () => {
    getToken.mockResolvedValue({ email: "gone@example.com", sub: "s", role: "admin" });
    findUnique.mockResolvedValue(null);
    expect(await isAdminRequest(req)).toBe(false);
    expect((await requireAdmin(req)).ok).toBe(false);
  });

  it("still admits a live account, and hands back its real Mongo id", async () => {
    getToken.mockResolvedValue({ email: "live@example.com", sub: "google-sub" });
    findUnique.mockResolvedValue({ id: "507f1f77bcf86cd799439011" });
    const guard = await requireUser(req);
    expect(guard.ok).toBe(true);
    // token.sub is the Google subject, never the Mongo id — callers need this one.
    if (guard.ok) expect(guard.userId).toBe("507f1f77bcf86cd799439011");
  });

  it("401s an unauthenticated request without touching the database", async () => {
    getToken.mockResolvedValue(null);
    const guard = await requireUser(req);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("503s rather than admitting anyone when the database is unreadable", async () => {
    getToken.mockResolvedValue({ email: "live@example.com", sub: "s" });
    findUnique.mockRejectedValue(new Error("db down"));
    const guard = await requireUser(req);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(503);
  });
});

describe("cost and failure behaviour", () => {
  it("anonymous requests never hit the database", async () => {
    getToken.mockResolvedValue(null);
    expect(await isAdminRequest(req)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("an ordinary signed-in visitor never hits the database", async () => {
    // Public catalogue GETs run this on every request — a non-admin token must
    // not cost a lookup.
    session("user", "user");
    expect(await isAdminRequest(req)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("fails closed when the role lookup throws", async () => {
    getToken.mockResolvedValue({ email: "staff@example.com", role: "admin" });
    findUnique.mockRejectedValue(new Error("db down"));
    expect(await isAdminRequest(req)).toBe(false);
  });

  it("500s rather than guessing when NEXTAUTH_SECRET is missing", async () => {
    delete process.env.NEXTAUTH_SECRET;
    const guard = await requireAdmin(req);
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(500);
  });
});
