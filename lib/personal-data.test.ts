import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUDIT_RETENTION_MONTHS,
  entriesExported,
  entriesNeedingDeletionWork,
  PERSONAL_DATA_INVENTORY,
  REDACTED_EMAIL,
  REDACTED_NAME,
} from "./personal-data";

// These tests read the actual schema and the actual route sources, so they fail
// when reality drifts from the declared inventory — which is exactly how the gap
// arose: models with a bare `userId` string were added over time, and neither the
// export nor the deletion flow was revisited.

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const schema = read("prisma/schema.prisma");
const exportRoute = read("app/api/account/export/route.ts");
const deleteRoute = read("app/api/account/route.ts");
const retentionDoc = read("docs/DATA-RETENTION.md");

/** Field names that tie a row to a user account. `visitorId` is deliberately
 *  absent: it's a first-party cookie id with no account link. */
const USER_LINK_FIELDS = [
  "userId",
  "userEmail",
  "authorId",
  "authorEmail",
  "actorId",
  "actorEmail",
  "assigneeId",
  "createdById",
  "uploadedById",
];

/** Every `model X { ... }` block in the Prisma schema, as [name, body]. */
function schemaModels(): [string, string][] {
  const out: [string, string][] = [];
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) out.push([m[1] as string, m[2] as string]);
  return out;
}

/** Models that carry a link to a user, by field name or by a `user` relation. */
function userLinkedModels(): string[] {
  return schemaModels()
    .filter(([, body]) => {
      // Ignore comment lines so prose mentioning "userId" can't create a false hit.
      const code = body
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("///"))
        .join("\n");
      if (/^\s*user\s+User/m.test(code)) return true;
      return USER_LINK_FIELDS.some((f) => new RegExp(`^\\s*${f}\\s`, "m").test(code));
    })
    .map(([name]) => name);
}

describe("the inventory covers the schema", () => {
  it("sanity: the schema parses into models", () => {
    const names = schemaModels().map(([n]) => n);
    expect(names).toContain("User");
    expect(names).toContain("AuditLog");
    expect(names.length).toBeGreaterThan(20);
  });

  it("every user-linked model has a declared disposition", () => {
    const declared = new Set(PERSONAL_DATA_INVENTORY.map((e) => e.model));
    const missing = userLinkedModels().filter((m) => !declared.has(m));
    // If this fails you've added a model holding user-linked data without
    // deciding whether it's exported and what deletion does to it. Add it to
    // PERSONAL_DATA_INVENTORY and implement the disposition — don't just append
    // the name here.
    expect(missing).toEqual([]);
  });

  it("declares nothing that isn't a real model", () => {
    const real = new Set(schemaModels().map(([n]) => n));
    expect(PERSONAL_DATA_INVENTORY.filter((e) => !real.has(e.model)).map((e) => e.model)).toEqual([]);
  });

  it("lists no model twice", () => {
    const names = PERSONAL_DATA_INVENTORY.map((e) => e.model);
    expect(names.length).toBe(new Set(names).size);
  });

  it("gives every entry a reason", () => {
    for (const e of PERSONAL_DATA_INVENTORY) {
      expect(e.reason.length, e.model).toBeGreaterThan(30);
    }
  });
});

describe("the export route implements the inventory", () => {
  it("queries every collection marked as exported", () => {
    const missing = entriesExported()
      // User is read as the account itself, by email rather than by model name.
      .filter((e) => e.model !== "User")
      .filter((e) => {
        const accessor = e.model.charAt(0).toLowerCase() + e.model.slice(1);
        return !exportRoute.includes(`prisma.${accessor}.`);
      })
      .map((e) => e.model);
    expect(missing).toEqual([]);
  });

  it("does NOT export OAuth tokens or session rows", () => {
    // Data minimisation: useless to the user, sensitive if an export leaked.
    expect(exportRoute).not.toMatch(/prisma\.account\./);
    expect(exportRoute).not.toMatch(/prisma\.session\./);
  });

  it("exports the retained audit entries, so the exception is transparent", () => {
    const audit = PERSONAL_DATA_INVENTORY.find((e) => e.model === "AuditLog");
    expect(audit?.onDelete).toBe("retain");
    expect(audit?.exported).toBe(true);
    expect(exportRoute).toMatch(/prisma\.auditLog\./);
  });
});

describe("the deletion route implements the inventory", () => {
  it("acts on every collection the cascade does not cover", () => {
    const missing = entriesNeedingDeletionWork()
      .filter((e) => e.model !== "User")
      .filter((e) => {
        const accessor = e.model.charAt(0).toLowerCase() + e.model.slice(1);
        // TaskComment.mentions is cleared via $runCommandRaw on the collection
        // name, so accept either the Prisma accessor or the raw collection.
        return (
          !deleteRoute.includes(`prisma.${accessor}.`) &&
          !deleteRoute.includes(`"${e.model}"`)
        );
      })
      .map((e) => e.model);
    expect(missing).toEqual([]);
  });

  it("never touches the audit log", () => {
    // The retention exception only means something if deletion can't reach it.
    expect(deleteRoute).not.toMatch(/prisma\.auditLog\./);
  });

  it("redacts contact-message identity with the shared placeholders", () => {
    expect(deleteRoute).toContain("REDACTED_NAME");
    expect(deleteRoute).toContain("REDACTED_EMAIL");
    // .invalid is reserved (RFC 2606) — a stray mailto: can never be delivered.
    expect(REDACTED_EMAIL.endsWith(".invalid")).toBe(true);
    expect(REDACTED_NAME).not.toBe("");
  });

  it("deletes the account row last, so the cascade can't outrun the loose links", () => {
    const lastLooseWrite = Math.max(
      deleteRoute.lastIndexOf("updateMany"),
      deleteRoute.lastIndexOf("deleteMany")
    );
    expect(deleteRoute.indexOf("prisma.user.delete")).toBeGreaterThan(lastLooseWrite);
  });
});

describe("the retention exception is bounded and documented", () => {
  it("audit is the ONLY collection retained identifiably", () => {
    expect(PERSONAL_DATA_INVENTORY.filter((e) => e.onDelete === "retain").map((e) => e.model)).toEqual(
      ["AuditLog"]
    );
  });

  it("has a defined period, not an open-ended one", () => {
    expect(AUDIT_RETENTION_MONTHS).toBeGreaterThan(0);
    expect(AUDIT_RETENTION_MONTHS).toBeLessThanOrEqual(24);
  });

  it("the purge script uses the same period as the policy", () => {
    const script = read("scripts/purge-audit-logs.mjs");
    expect(script).toMatch(new RegExp(`RETENTION_MONTHS = ${AUDIT_RETENTION_MONTHS}\\b`));
  });

  it("the policy doc states the period and names the exception", () => {
    expect(retentionDoc).toContain(`${AUDIT_RETENTION_MONTHS} months`);
    expect(retentionDoc).toContain("AuditLog");
  });

  it("the account page tells the user about it before they delete", () => {
    const page = read("app/(main)/account/page.tsx");
    expect(page).toContain(`${AUDIT_RETENTION_MONTHS} months`);
    // The old copy promised deletion of "all associated data", which wasn't true.
    expect(page).not.toContain("all associated data");
  });

  it("the privacy policy states it too, with no unfilled placeholder", () => {
    const privacy = read("app/(main)/privacy/page.tsx");
    expect(privacy).toContain(`${AUDIT_RETENTION_MONTHS} months`);
    expect(privacy).not.toContain("[set your");
  });
});
