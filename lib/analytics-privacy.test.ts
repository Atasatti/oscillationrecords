import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pseudonymize } from "./analytics-privacy";
import { ALL_PERMISSIONS, permissionsForRole, roleCan, SCOPED_ROLES } from "./permissions";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// The identifiable/aggregate split is only as good as the role policy behind it,
// so these assert the policy directly and then check every analytics route
// actually consults it. A route that forgets is the whole bug coming back.

describe("analytics:pii is owner-only", () => {
  it("is a real permission", () => {
    expect(ALL_PERMISSIONS).toContain("analytics:pii");
  });

  it("no scoped role holds it", () => {
    // catalog / promotion / analytics / viewer all previously received the
    // identifiable view through analytics:read. None of them need it.
    for (const role of SCOPED_ROLES) {
      expect(roleCan(role, "analytics:pii"), role).toBe(false);
    }
  });

  it("the owner holds it", () => {
    expect(roleCan("admin", "analytics:pii")).toBe(true);
    expect(permissionsForRole("admin")).toContain("analytics:pii");
  });

  it("non-staff hold nothing", () => {
    expect(roleCan("user", "analytics:pii")).toBe(false);
    expect(roleCan(null, "analytics:pii")).toBe(false);
    expect(roleCan(undefined, "analytics:pii")).toBe(false);
  });

  it("every role that reads analytics still reads the aggregate view", () => {
    // The split must not have taken away the numbers these roles legitimately need.
    for (const role of ["catalog", "promotion", "analytics", "viewer"] as const) {
      expect(roleCan(role, "analytics:read"), role).toBe(true);
    }
  });

  it("granting analytics:read does not imply analytics:pii", () => {
    const readers = SCOPED_ROLES.filter((r) => roleCan(r, "analytics:read"));
    expect(readers.length).toBeGreaterThan(0);
    expect(readers.filter((r) => roleCan(r, "analytics:pii"))).toEqual([]);
  });
});

describe("pseudonymize", () => {
  it("is stable, so returning-listener metrics still work", () => {
    expect(pseudonymize("user-123")).toBe(pseudonymize("user-123"));
  });

  it("separates different people", () => {
    expect(pseudonymize("user-123")).not.toBe(pseudonymize("user-456"));
  });

  it("never leaks the input", () => {
    const id = "507f1f77bcf86cd799439011";
    const out = pseudonymize(id);
    expect(out).not.toContain(id);
    expect(out).not.toContain(id.slice(0, 8));
  });

  it("never leaks an email passed in as an identifier", () => {
    const out = pseudonymize("someone@example.com");
    expect(out).not.toContain("someone");
    expect(out).not.toContain("@");
  });

  it("labels anonymous rows rather than inventing an identity", () => {
    expect(pseudonymize(null)).toBe("Anonymous");
    expect(pseudonymize(undefined)).toBe("Anonymous");
    expect(pseudonymize("")).toBe("Anonymous");
  });

  it("supports distinct labels for members and visitors", () => {
    expect(pseudonymize("abc", "Member")).toMatch(/^Member [0-9a-f]{8}$/);
    expect(pseudonymize("abc", "Visitor")).toMatch(/^Visitor [0-9a-f]{8}$/);
  });
});

describe("every analytics route consults the split", () => {
  // Each route that returns identity must ask canReadAnalyticsPii. Listed
  // explicitly so adding an analytics route means consciously adding it here.
  const ROUTES = [
    "app/api/analytics/raw/route.ts",
    "app/api/analytics/dashboard/route.ts",
    "app/api/analytics/content/[contentId]/route.ts",
    "app/api/admin/error-log/route.ts",
  ];

  for (const path of ROUTES) {
    it(`${path} gates identity on analytics:pii`, () => {
      const src = read(path);
      expect(src).toContain("canReadAnalyticsPii");
      expect(src).toContain("showPii");
    });

    it(`${path} audits identifiable access`, () => {
      expect(read(path)).toContain("logAnalyticsPiiAccess");
    });
  }

  it("no analytics route is gated on analytics:read alone any more", () => {
    // link-clicks is the exception: it returns only content names and counts,
    // never an identity, so it has nothing to split.
    const src = read("app/api/analytics/link-clicks/route.ts");
    expect(src).toContain("analytics:read");
    expect(src).not.toContain("email");
  });
});

describe("identity fields are conditional, not unconditional", () => {
  it("the raw inspector withholds signup and subscriber lists", () => {
    const src = read("app/api/analytics/raw/route.ts");
    // Both lists are pure identity — there's no useful pseudonymized version of
    // "here are ten email addresses", so they're emptied rather than masked.
    expect(src).toMatch(/recentSignups: showPii/);
    expect(src).toMatch(/recentSubscribers: showPii/);
  });

  it("the content view no longer hands every reader a listener's email", () => {
    const src = read("app/api/analytics/content/[contentId]/route.ts");
    expect(src).toMatch(/userEmail: showPii/);
    expect(src).toMatch(/userName: showPii/);
  });

  it("the error log withholds the affected user's email", () => {
    expect(read("app/api/admin/error-log/route.ts")).toMatch(/userEmail: null/);
  });

  it("aggregate geography survives the split", () => {
    // Country/city COUNTS are what a catalogue or promotion role actually needs;
    // only per-row city was withheld. Guard against over-redacting them away.
    const src = read("app/api/analytics/dashboard/route.ts");
    expect(src).toContain("topCountries");
    expect(src).toContain("topCities");
  });
});
