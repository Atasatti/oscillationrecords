// Copy every collection's indexes from SOURCE (Mumbai) → TARGET (London), read
// straight off the source so it matches whatever `prisma db push` created there
// (no need to re-derive from schema.prisma). Data-safe: only createIndex calls.
// Run:  node --use-system-ca scripts/copy-mongo-indexes.mjs
import { MongoClient } from "mongodb";
import fs from "node:fs";

if (!process.env.SOURCE_URL || !process.env.TARGET_URL) {
  try {
    for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
}

const SOURCE = process.env.SOURCE_URL || process.env.DATABASE_URL;
const TARGET = process.env.TARGET_URL;
const dbNameFromUri = (uri) => (uri && uri.match(/\/([^/?]+)(\?|$)/)?.[1]) || null;
const srcName = dbNameFromUri(SOURCE);
const tgtName = dbNameFromUri(TARGET) || "oscillation_db";
if (!SOURCE || !TARGET || !srcName) {
  console.error("Need DATABASE_URL (source) and TARGET_URL.");
  process.exit(1);
}

const s = new MongoClient(SOURCE);
const t = new MongoClient(TARGET);
(async () => {
  await s.connect(); await t.connect();
  const src = s.db(srcName), tgt = t.db(tgtName);
  const colls = (await src.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name).filter((n) => !n.startsWith("system."));
  let made = 0, skipped = 0;
  for (const name of colls) {
    let idxs = [];
    try { idxs = await src.collection(name).indexes(); } catch { continue; }
    for (const ix of idxs) {
      if (ix.name === "_id_") continue;
      const opts = { name: ix.name };
      if (ix.unique) opts.unique = true;
      if (ix.sparse) opts.sparse = true;
      if (ix.partialFilterExpression) opts.partialFilterExpression = ix.partialFilterExpression;
      try { await tgt.collection(name).createIndex(ix.key, opts); made++; }
      catch (e) { skipped++; console.log(`skip ${name}.${ix.name}: ${e.codeName || e.message}`); }
    }
  }
  console.log(`\nIndexes created/ensured: ${made}, skipped: ${skipped}`);
  await s.close(); await t.close();
})().catch((e) => { console.error("Index copy error:", e.message); process.exit(1); });
