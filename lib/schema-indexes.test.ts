import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/check-index-drift.mjs decides whether the live database matches the
// schema, and a deploy now fails on its verdict. That makes its schema parser
// load-bearing: if it silently parsed nothing, drift detection would report
// "no drift" forever and be worse than having none. These tests pin the parser
// against the real schema.
//
// The parser is duplicated here rather than imported because the script is a
// plain .mjs run by node with no build step. The duplication is guarded by the
// "matches the script's implementation" test at the bottom.

const root = join(__dirname, "..");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const script = readFileSync(join(root, "scripts/check-index-drift.mjs"), "utf8");

type Declared = { model: string; fields: string[]; unique: boolean };

function declaredIndexes(src: string): Declared[] {
  const out: Declared[] = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(src))) {
    const model = m[1] as string;
    const body = m[2] as string;
    const mapped = new Map<string, string>();
    for (const line of body.split("\n")) {
      const fm = line.match(/^\s*(\w+)\s+\S+.*@map\("([^"]+)"\)/);
      if (fm) mapped.set(fm[1] as string, fm[2] as string);
    }
    const col = (f: string) => mapped.get(f) ?? f;

    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("//") || line.startsWith("///")) continue;
      const block = line.match(/^@@(index|unique)\(\[([^\]]+)\]/);
      if (block) {
        const fields = (block[2] as string)
          .split(",")
          .map((f) => f.trim().split("(")[0] as string)
          .filter(Boolean);
        out.push({ model, fields: fields.map(col), unique: block[1] === "unique" });
        continue;
      }
      const field = line.match(/^(\w+)\s+\S+/);
      if (field && /@unique\b/.test(line) && !/@id\b/.test(line)) {
        out.push({ model, fields: [col(field[1] as string)], unique: true });
      }
    }
  }
  return out;
}

const declared = declaredIndexes(schema);
const find = (model: string, fields: string[]) =>
  declared.find(
    (d) => d.model === model && d.fields.join(",") === fields.join(",")
  );

describe("the schema index parser", () => {
  it("finds a substantial number of indexes, not zero", () => {
    // The failure mode that matters: a parser that matches nothing would make
    // every drift check pass vacuously.
    expect(declared.length).toBeGreaterThan(50);
  });

  it("reads a single-field @@index", () => {
    expect(find("AuditLog", ["at"])).toMatchObject({ unique: false });
  });

  it("reads a compound @@index in declaration order", () => {
    expect(find("AuditLog", ["resource", "at"])).toMatchObject({ unique: false });
    // Order matters to MongoDB — [resource, at] is not [at, resource].
    expect(find("AuditLog", ["at", "resource"])).toBeUndefined();
  });

  it("reads a field-level @unique as a unique index", () => {
    expect(find("ErrorLog", ["fingerprint"])).toMatchObject({ unique: true });
    expect(find("NewsletterSubscriber", ["email"])).toMatchObject({ unique: true });
  });

  it("reads a multikey index on a scalar list", () => {
    // The array-field indexes the audit flagged as missing.
    expect(find("Release", ["primaryArtistIds"])).toBeDefined();
    expect(find("Release", ["featureArtistIds"])).toBeDefined();
    expect(find("Track", ["primaryArtistIds"])).toBeDefined();
    expect(find("Track", ["featureArtistIds"])).toBeDefined();
    expect(find("TaskComment", ["mentions"])).toBeDefined();
  });

  it("never emits the primary key, which always exists in Mongo", () => {
    // @id maps to _id; reporting it would be permanent false-positive drift.
    expect(declared.filter((d) => d.fields.includes("id"))).toEqual([]);
    expect(declared.filter((d) => d.fields.includes("_id"))).toEqual([]);
  });

  it("ignores index-like text inside comments", () => {
    const withComment = `
model Fake {
  id  String @id @map("_id")
  /// @@index([ghost]) mentioned in prose
  // @@unique([alsoGhost])
  real String
  @@index([real])
}
`;
    const parsed = declaredIndexes(withComment);
    expect(parsed).toEqual([{ model: "Fake", fields: ["real"], unique: false }]);
  });

  it("honours @map when a field is renamed in the database", () => {
    const renamed = `
model Fake {
  id      String @id @map("_id")
  userRef String @map("user_ref")
  @@index([userRef])
}
`;
    expect(declaredIndexes(renamed)).toEqual([
      { model: "Fake", fields: ["user_ref"], unique: false },
    ]);
  });

  it("distinguishes @@unique from @@index", () => {
    const both = `
model Fake {
  id String @id @map("_id")
  a  String
  b  String
  @@unique([a, b])
  @@index([b])
}
`;
    const parsed = declaredIndexes(both);
    expect(parsed).toContainEqual({ model: "Fake", fields: ["a", "b"], unique: true });
    expect(parsed).toContainEqual({ model: "Fake", fields: ["b"], unique: false });
  });

  it("matches the script's implementation", () => {
    // Cheap guard against the copy above drifting from the real one: both must
    // contain the same three matcher patterns.
    for (const pattern of [
      "^model\\\\s+(\\\\w+)\\\\s*\\\\{",
      "@@(index|unique)",
      "@unique\\\\b",
    ]) {
      expect(script, pattern).toContain(pattern.replace(/\\\\/g, "\\"));
    }
  });
});

describe("the indexes the audit flagged are genuinely declared", () => {
  // If any of these disappeared from the schema, "no drift" would become true
  // for the wrong reason.
  const EXPECTED: [string, string[]][] = [
    ["ErrorLog", ["fingerprint"]],
    // The idempotency constraint that stops one automation firing twice for the
    // same entity — the audit's "automation idempotency may fail" point.
    ["AutomationFire", ["ruleKey", "entityType", "entityId"]],
    ["ContactMessage", ["createdAt"]],
    ["Campaign", ["createdAt"]],
    ["OutreachTask", ["assigneeId"]],
    ["AuditLog", ["actorId", "at"]],
    ["SavedView", ["userId"]],
  ];
  for (const [model, fields] of EXPECTED) {
    it(`${model}.[${fields.join(", ")}]`, () => {
      expect(find(model, fields)).toBeDefined();
    });
  }
});
