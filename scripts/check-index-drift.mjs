// Compare the indexes declared in prisma/schema.prisma with the indexes that
// actually exist in the live database. READ-ONLY — creates nothing, drops
// nothing, and is safe to run against production at any time.
//
//   node --env-file=.env --use-system-ca scripts/check-index-drift.mjs
//   node --env-file=.env --use-system-ca scripts/check-index-drift.mjs --json
//
// Exit code 0 when the database matches the schema, 1 when it drifts — so this
// can gate a deploy or run as a monitor. `prisma db push` is the only thing that
// creates these indexes, and it's a manual step here (npm run db:deploy), so
// drift is the normal state between a schema change and a deploy, not an anomaly.
//
// Documented, intentional omissions live in INTENTIONALLY_UNINDEXED below.

import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const JSON_OUT = process.argv.includes("--json");

// Indexes deliberately NOT expected in the database, with the reason. Anything
// listed here is excluded from the drift report instead of being noise.
const INTENTIONALLY_UNINDEXED = [
  // e.g. { collection: "Foo", key: "bar", reason: "..." }
];

function resolveDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const m = env.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* rely on platform env */
  }
  return null;
}

/**
 * Parse the index declarations out of schema.prisma.
 *
 * Covers the three ways this schema declares one: `@@index([a, b])`,
 * `@@unique([a, b])`, and a field-level `@unique`. `@id` maps to Mongo's `_id`,
 * which always exists, so it is skipped.
 */
function declaredIndexes(schemaPath) {
  const schema = readFileSync(schemaPath, "utf8");
  const out = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = modelRe.exec(schema))) {
    const model = m[1];
    const body = m[2];
    // Field-name -> mapped column, for @map("...") renames.
    const mapped = new Map();
    for (const line of body.split("\n")) {
      const fm = line.match(/^\s*(\w+)\s+\S+.*@map\("([^"]+)"\)/);
      if (fm) mapped.set(fm[1], fm[2]);
    }
    const col = (f) => mapped.get(f) ?? f;

    for (const raw of body.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("//") || line.startsWith("///")) continue;

      const block = line.match(/^@@(index|unique)\(\[([^\]]+)\]/);
      if (block) {
        const fields = block[2].split(",").map((f) => f.trim().split("(")[0]).filter(Boolean);
        out.push({ model, fields: fields.map(col), unique: block[1] === "unique" });
        continue;
      }
      // Field-level @unique (but not @@unique, and never @id/_id).
      const field = line.match(/^(\w+)\s+\S+/);
      if (field && /@unique\b/.test(line) && !/@id\b/.test(line)) {
        out.push({ model, fields: [col(field[1])], unique: true });
      }
    }
  }
  return out;
}

/** A comparable signature for an index: ordered field list. */
const sig = (fields) => fields.join(",");

function isIntentional(model, fields) {
  return INTENTIONALLY_UNINDEXED.some(
    (e) => e.collection === model && e.key === sig(fields)
  );
}

async function main() {
  const url = resolveDbUrl();
  if (!url) {
    console.error("DATABASE_URL not found (env or .env).");
    process.exit(2);
  }
  const dbName = url.match(/\/([^/?]+)(\?|$)/)?.[1];
  if (!dbName) {
    console.error("Could not read the database name from DATABASE_URL.");
    process.exit(2);
  }

  const declared = declaredIndexes(new URL("../prisma/schema.prisma", import.meta.url));
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);

  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name)
  );

  const missing = [];
  const uniqueMismatch = [];
  const missingCollections = new Set();

  // Group declarations by model so each collection is read once.
  const byModel = new Map();
  for (const d of declared) {
    if (!byModel.has(d.model)) byModel.set(d.model, []);
    byModel.get(d.model).push(d);
  }

  for (const [model, decls] of byModel) {
    if (!existingCollections.has(model)) {
      // A collection Mongo hasn't created yet (no document ever written) can't
      // hold indexes. Report it once rather than as one miss per declaration.
      missingCollections.add(model);
      continue;
    }
    const live = await db.collection(model).indexes();
    const liveBySig = new Map(
      live.map((i) => [sig(Object.keys(i.key)), { name: i.name, unique: Boolean(i.unique) }])
    );

    for (const d of decls) {
      if (isIntentional(model, d.fields)) continue;
      const found = liveBySig.get(sig(d.fields));
      if (!found) {
        missing.push({ model, fields: d.fields, unique: d.unique });
      } else if (d.unique && !found.unique) {
        uniqueMismatch.push({ model, fields: d.fields, liveName: found.name });
      }
    }
  }

  const report = {
    database: dbName,
    declaredIndexes: declared.length,
    missingCollections: [...missingCollections],
    missingIndexes: missing,
    uniqueConstraintMismatches: uniqueMismatch,
    intentionalOmissions: INTENTIONALLY_UNINDEXED,
  };

  await client.close();

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`database: ${dbName}`);
    console.log(`declared indexes in schema.prisma: ${declared.length}\n`);
    if (missingCollections.size) {
      console.log("COLLECTIONS THAT DO NOT EXIST:");
      for (const c of missingCollections) console.log(`  - ${c}`);
      console.log();
    }
    if (missing.length) {
      console.log("MISSING INDEXES:");
      for (const i of missing) {
        console.log(`  - ${i.model}.[${i.fields.join(", ")}]${i.unique ? "  (UNIQUE)" : ""}`);
      }
      console.log();
    }
    if (uniqueMismatch.length) {
      console.log("EXISTS BUT NOT UNIQUE (schema says unique):");
      for (const i of uniqueMismatch) {
        console.log(`  - ${i.model}.[${i.fields.join(", ")}]  (live index "${i.liveName}")`);
      }
      console.log();
    }
    const drift =
      missing.length + uniqueMismatch.length + missingCollections.size;
    console.log(drift === 0 ? "No drift — the database matches the schema." : `DRIFT: ${drift} discrepancies.`);
  }

  const drift = missing.length + uniqueMismatch.length + missingCollections.size;
  process.exitCode = drift === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
