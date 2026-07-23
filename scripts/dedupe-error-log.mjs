// Merge duplicate ErrorLog rows that share a fingerprint, so the unique index
// declared in prisma/schema.prisma can actually be created.
//
//   Dry run (default — prints every group, writes nothing):
//     node --env-file=.env --use-system-ca scripts/dedupe-error-log.mjs
//   Merge for real:
//     node --env-file=.env --use-system-ca scripts/dedupe-error-log.mjs --apply
//
// WHY THE DUPLICATES EXIST: lib/error-log.ts de-duplicates with findUnique →
// (miss) → create, and catches P2002 for the race where two identical errors
// are recorded at once. With no unique index in the database there is nothing to
// violate, so P2002 never fires and both writes create a row. The duplicates are
// the symptom; the missing index is the cause. Merge first, then index — running
// `prisma db push` against duplicate data fails on index creation.
//
// MERGE RULE: the surviving row is the one with the newest `lastSeen` (it holds
// the freshest sample — message, stack, path, user agent). It then absorbs:
//   count      = sum of the group  (occurrences were split across the rows)
//   firstSeen  = earliest in the group
//   lastSeen   = latest in the group
//   resolved   = false if ANY row is unresolved (a live recurrence re-opens it)
// The other rows are deleted. No occurrence counts are lost.
//
// SAFETY: .env points at LIVE production. --apply deletes rows. Back up first —
// see docs/DB-INDEXES.md.

import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";

const APPLY = process.argv.includes("--apply");

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

async function main() {
  const url = resolveDbUrl();
  if (!url) {
    console.error("DATABASE_URL not found (env or .env).");
    process.exit(2);
  }
  const dbName = url.match(/\/([^/?]+)(\?|$)/)?.[1];
  const client = new MongoClient(url);
  await client.connect();
  const col = client.db(dbName).collection("ErrorLog");

  console.log(`database: ${dbName}`);
  console.log(`Mode: ${APPLY ? "APPLY (merging + deleting)" : "DRY-RUN (no writes)"}\n`);

  const groups = await col
    .aggregate([
      { $group: { _id: "$fingerprint", ids: { $push: "$_id" }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } },
    ])
    .toArray();

  if (groups.length === 0) {
    console.log("No duplicate fingerprints — the unique index can be created safely.");
    await client.close();
    return;
  }

  console.log(`${groups.length} duplicate fingerprint group(s):\n`);
  let wouldDelete = 0;

  for (const g of groups) {
    const rows = await col.find({ _id: { $in: g.ids } }).toArray();
    rows.sort((a, b) => new Date(b.lastSeen ?? 0) - new Date(a.lastSeen ?? 0));
    const [survivor, ...losers] = rows;

    const totalCount = rows.reduce((n, r) => n + (r.count ?? 1), 0);
    const firstSeen = rows
      .map((r) => new Date(r.firstSeen ?? r.lastSeen ?? Date.now()))
      .sort((a, b) => a - b)[0];
    const lastSeen = rows
      .map((r) => new Date(r.lastSeen ?? 0))
      .sort((a, b) => b - a)[0];
    const resolved = rows.every((r) => r.resolved === true);

    console.log(`  fingerprint ${g._id.slice(0, 12)}…  (${rows.length} rows)`);
    console.log(`    message : ${String(survivor.message ?? "").slice(0, 100)}`);
    console.log(`    keeping : ${survivor._id} (newest lastSeen ${lastSeen.toISOString()})`);
    console.log(`    merging : count ${rows.map((r) => r.count ?? 1).join(" + ")} = ${totalCount}`);
    console.log(`              firstSeen ${firstSeen.toISOString()}, resolved=${resolved}`);
    console.log(`    deleting: ${losers.map((r) => r._id).join(", ")}\n`);
    wouldDelete += losers.length;

    if (APPLY) {
      await col.updateOne(
        { _id: survivor._id },
        { $set: { count: totalCount, firstSeen, lastSeen, resolved } }
      );
      await col.deleteMany({ _id: { $in: losers.map((r) => r._id) } });
    }
  }

  if (!APPLY) {
    console.log(`Dry run — nothing written. ${wouldDelete} row(s) would be deleted.`);
    console.log("Re-run with --apply to merge, then create the index.");
  } else {
    const left = await col
      .aggregate([
        { $group: { _id: "$fingerprint", n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ])
      .toArray();
    console.log(`Merged. ${wouldDelete} row(s) deleted; ${left.length} duplicate group(s) remain.`);
    if (left.length === 0) console.log("The unique index can now be created.");
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
