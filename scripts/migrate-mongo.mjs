// One-time, NON-DESTRUCTIVE MongoDB data copy: SOURCE (current Mumbai) → TARGET
// (new London cluster). Reads every collection from the source and copies the
// documents — preserving _id and all BSON types, so cross-references (artist ↔
// release ids) stay valid — into the target db of the same name. The SOURCE is
// only ever READ; if anything looks wrong you just don't switch DATABASE_URL.
//
// Setup:
//   npm i -D mongodb
//
// Provide both connection strings (each MUST include the db name, …/oscillation_db):
//   - SOURCE_URL  → defaults to DATABASE_URL from your .env (the Mumbai cluster)
//   - TARGET_URL  → the new London cluster string
//   PowerShell:  $env:TARGET_URL = "mongodb+srv://user:pass@newcluster.mongodb.net/oscillation_db?retryWrites=true&w=majority"
//
// Run:
//   node scripts/migrate-mongo.mjs           # copies; refuses to touch a non-empty target collection
//   node scripts/migrate-mongo.mjs --force   # clears + re-copies non-empty target collections
//
// After it reports "all counts match":
//   1) npx prisma db push        (against TARGET — recreates the schema.prisma indexes)
//   2) set DATABASE_URL = TARGET_URL in Vercel (Production) AND your local .env
//   3) redeploy; keep the old cluster ~a week as a fallback.

import { MongoClient } from "mongodb";
import fs from "node:fs";

// Pull SOURCE_URL from .env's DATABASE_URL when not explicitly set.
if (!process.env.SOURCE_URL || !process.env.TARGET_URL) {
  try {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // no .env — rely on explicit env vars
  }
}

const SOURCE = process.env.SOURCE_URL || process.env.DATABASE_URL;
const TARGET = process.env.TARGET_URL;
const FORCE = process.argv.includes("--force");
const BATCH = 500;

const dbNameFromUri = (uri) => {
  const m = uri && uri.match(/\/([^/?]+)(\?|$)/);
  return m ? decodeURIComponent(m[1]) : null;
};

if (!SOURCE || !TARGET) {
  console.error("Set TARGET_URL (and SOURCE_URL or DATABASE_URL). Both must include /oscillation_db.");
  process.exit(1);
}
const srcName = dbNameFromUri(SOURCE);
// Vercel's string often has no db in the path ("…/?..."), so default the target
// to the same db name the app uses — you can paste TARGET_URL verbatim.
const tgtName = dbNameFromUri(TARGET) || "oscillation_db";
if (!srcName) {
  console.error("SOURCE_URL/DATABASE_URL must include the database name in the path (…/oscillation_db).");
  process.exit(1);
}

const srcClient = new MongoClient(SOURCE);
const tgtClient = new MongoClient(TARGET);

(async () => {
  await srcClient.connect();
  await tgtClient.connect();
  const src = srcClient.db(srcName);
  const tgt = tgtClient.db(tgtName);
  console.log(`Copying "${srcName}" → "${tgtName}"  (source is read-only)\n`);

  const colls = (await src.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith("system."));

  let grandTotal = 0;
  let mismatch = false;
  for (const name of colls) {
    const sColl = src.collection(name);
    const tColl = tgt.collection(name);
    const srcCount = await sColl.countDocuments();
    const tgtExisting = await tColl.countDocuments();

    if (tgtExisting > 0 && !FORCE) {
      console.log(`SKIP  ${name.padEnd(26)} target already has ${tgtExisting} docs (use --force to overwrite)`);
      continue;
    }
    if (tgtExisting > 0 && FORCE) {
      await tColl.deleteMany({});
    }

    let copied = 0;
    let buf = [];
    for await (const doc of sColl.find({})) {
      buf.push(doc);
      if (buf.length >= BATCH) {
        await tColl.insertMany(buf, { ordered: false });
        copied += buf.length;
        buf = [];
      }
    }
    if (buf.length) {
      await tColl.insertMany(buf, { ordered: false });
      copied += buf.length;
    }

    const ok = copied === srcCount;
    if (!ok) mismatch = true;
    grandTotal += copied;
    console.log(`${ok ? "OK  " : "WARN"}  ${name.padEnd(26)} ${copied}/${srcCount} copied`);
  }

  console.log(`\nDone. ${colls.length} collections, ${grandTotal} documents copied.`);
  console.log(
    mismatch
      ? "⚠  Some counts didn't match — investigate BEFORE switching DATABASE_URL."
      : "✓  All collection counts match. Safe to point DATABASE_URL at the new cluster."
  );

  await srcClient.close();
  await tgtClient.close();
  process.exit(mismatch ? 1 : 0);
})().catch(async (e) => {
  console.error("Migration error:", e.message);
  try { await srcClient.close(); await tgtClient.close(); } catch {}
  process.exit(1);
});
