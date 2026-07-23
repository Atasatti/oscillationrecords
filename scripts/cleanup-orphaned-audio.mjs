// Orphaned-audio audit + cleanup (audit #6's reaper, scoped to audio).
//
// An "orphan" is an object under one of the AUDIO prefixes that no database
// record references any more — audio left behind when a track was deleted or
// its file replaced (nothing swept S3), or uploads that never got attached.
// Under the public tracks/audio/ prefix those files stay anonymously
// downloadable forever, which is both a storage cost and a leak risk for
// unreleased material.
//
//   Dry run (default — read-only, prints every orphan + totals):
//     node --env-file=.env --use-system-ca scripts/cleanup-orphaned-audio.mjs
//   Quarantine them (move to quarantine/<original-key>, NOT hard delete):
//     node --env-file=.env --use-system-ca scripts/cleanup-orphaned-audio.mjs --apply
//
// WHY QUARANTINE INSTEAD OF DELETE: some of these may be unreleased masters
// with no other copy. quarantine/ is in PRIVATE_KEY_PREFIXES (anonymous reads
// denied by the bucket policy), so moving there kills public access instantly,
// while a 30-day S3 lifecycle expiry on the prefix (set by --apply, idempotent)
// deletes them for good after a recovery window. Restoring one is a CopyObject
// back to its original key (printed in the manifest).
//
// SAFETY: matching is deliberately over-inclusive on the reference side — every
// non-analytics collection is scanned generically for bucket URLs/keys, so a
// reference stored anywhere (track, asset, terms JSON, page media, …) protects
// the object. Analytics collections (PlayEvent/PageView/LinkClick) store no
// file URLs (schema-checked) and are skipped for speed. .env points at LIVE
// production; --apply moves real objects.

import { readFileSync, writeFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import {
  S3Client,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

const APPLY = process.argv.includes("--apply");

// Every prefix where a presigned upload can land and later be abandoned —
// catalog audio (incl. legacy pre-unification paths) plus the attachment/DAM
// namespaces. An "abandoned" upload here = presigned PUT completed but the
// form/record step never did, so nothing references the object.
const AUDIO_PREFIXES = [
  "tracks/audio/",
  "tracks/stems/",
  "singles/audio/",
  "eps/audio/",
  "albums/audio/",
  "assets/", // DAM presign whose register step never ran
  "contact/", // contact-form attachments never submitted
  "task-attachments/", // uploaded but never attached to a task
  "releases/agreements/", // uploaded but never saved into terms
  "site/page-media/", // uploaded but never saved to page media
];

// Never touch objects younger than this: a presigned upload legitimately sits
// unreferenced between the PUT and the form/record submit. Two days is far
// beyond any real form session while still sweeping genuinely abandoned files.
const MIN_AGE_MS = 48 * 60 * 60 * 1000;

const QUARANTINE_PREFIX = "quarantine/";
const QUARANTINE_EXPIRY_DAYS = 30;

// Collections whose documents never hold file URLs (verified against
// prisma/schema.prisma) — skipped by the generic reference scan.
const SKIP_COLLECTIONS = new Set(["PlayEvent", "PageView", "LinkClick", "ErrorLog", "AuditLog"]);

function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const envFile = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const m = envFile.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch { /* fall through */ }
  return null;
}

const DB_URL = env("DATABASE_URL");
const Bucket = env("AWS_BUCKET_NAME") || env("S3_BUCKET_NAME") || "osrecord";
const region = env("AWS_REGION") || "us-east-1";

const s3 = new S3Client({
  region,
  credentials: { accessKeyId: env("AWS_ACCESS_KEY_ID"), secretAccessKey: env("AWS_SECRET_ACCESS_KEY") },
});

const bucketHost = `${Bucket}.s3.${region}.amazonaws.com`;

/** Normalized object keys referenced anywhere in one JSON-ish value. */
function extractKeys(value, out) {
  if (typeof value === "string") {
    // Full bucket URLs (decode the path so "My Song.mp3" matches its raw key).
    if (value.includes(bucketHost)) {
      try {
        const u = new URL(value);
        const key = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
        if (key) out.add(key);
      } catch { /* not a URL — fall through to raw-key check */ }
    }
    // Raw keys (Asset.fileKey, tracklist key fields).
    for (const p of AUDIO_PREFIXES) {
      if (value.startsWith(p)) out.add(value);
    }
    return;
  }
  if (Array.isArray(value)) { for (const v of value) extractKeys(v, out); return; }
  if (value && typeof value === "object") { for (const v of Object.values(value)) extractKeys(v, out); }
}

async function main() {
  if (!DB_URL) { console.error("DATABASE_URL not found."); process.exit(2); }
  const dbName = DB_URL.match(/\/([^/?]+)(\?|$)/)?.[1];
  const mongo = new MongoClient(DB_URL);
  await mongo.connect();
  const db = mongo.db(dbName);

  console.log(`bucket: ${Bucket} (${region})   db: ${dbName}`);
  console.log(`Mode: ${APPLY ? "APPLY (moving to quarantine/)" : "DRY-RUN (read-only)"}\n`);

  // 1. Every key the database references, from every non-analytics collection.
  const referenced = new Set();
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  for (const name of collections) {
    if (SKIP_COLLECTIONS.has(name)) continue;
    const cursor = db.collection(name).find({}, { batchSize: 500 });
    for await (const doc of cursor) extractKeys(doc, referenced);
  }
  console.log(`collections scanned: ${collections.length - SKIP_COLLECTIONS.size} (skipped analytics: ${[...SKIP_COLLECTIONS].join(", ")})`);
  console.log(`referenced object keys found: ${referenced.size}\n`);

  // 2. Every object actually under the audio prefixes.
  const orphans = [];
  let live = 0;
  for (const Prefix of AUDIO_PREFIXES) {
    let token;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) {
        if (referenced.has(o.Key)) live += 1;
        // Age guard: an upload mid-form is unreferenced but NOT abandoned.
        else if (o.LastModified && Date.now() - o.LastModified.getTime() < MIN_AGE_MS) live += 1;
        else orphans.push({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified });
      }
      token = r.NextContinuationToken;
    } while (token);
  }

  orphans.sort((a, b) => b.size - a.size);
  const totalBytes = orphans.reduce((n, o) => n + o.size, 0);

  console.log(`objects under audio prefixes: ${live + orphans.length} (${live} referenced, ${orphans.length} ORPHANED)`);
  console.log(`orphaned storage: ${(totalBytes / 1e9).toFixed(2)} GB\n`);
  for (const o of orphans) {
    console.log(`  ${(o.size / 1e6).toFixed(1).padStart(8)} MB  ${o.lastModified?.toISOString().slice(0, 10)}  ${o.key}`);
  }

  // Manifest: the record of what moved where (and the restore path).
  const manifestPath = new URL(`../orphaned-audio-manifest-${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
  writeFileSync(manifestPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    quarantinePrefix: QUARANTINE_PREFIX,
    expiryDays: QUARANTINE_EXPIRY_DAYS,
    totalBytes,
    orphans,
  }, null, 2));
  console.log(`\nmanifest written: ${manifestPath.pathname}`);

  if (!APPLY) {
    console.log("\nDry run — nothing moved. Re-run with --apply to quarantine these objects.");
    await mongo.close();
    return;
  }

  // 3. Move each orphan to quarantine/<original-key> — copy, verify size, delete.
  let moved = 0, failed = 0;
  for (const o of orphans) {
    const dest = `${QUARANTINE_PREFIX}${o.key}`;
    try {
      await s3.send(new CopyObjectCommand({
        Bucket,
        Key: dest,
        CopySource: `/${Bucket}/${encodeURIComponent(o.key).replace(/%2F/g, "/")}`,
      }));
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key: dest }));
      if ((head.ContentLength ?? -1) !== o.size) throw new Error(`size mismatch after copy (${head.ContentLength} != ${o.size})`);
      await s3.send(new DeleteObjectCommand({ Bucket, Key: o.key }));
      moved += 1;
    } catch (e) {
      failed += 1;
      console.error(`  FAILED ${o.key}: ${e.message}`);
    }
  }
  console.log(`\nmoved to quarantine: ${moved}; failed: ${failed}`);

  // 4. Idempotent 30-day expiry on quarantine/ so storage cost self-resolves.
  let existingRules = [];
  try {
    const cfg = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket }));
    existingRules = cfg.Rules ?? [];
  } catch (e) {
    if (e.name !== "NoSuchLifecycleConfiguration") throw e;
  }
  const others = existingRules.filter((r) => r.ID !== "expire-quarantine");
  await s3.send(new PutBucketLifecycleConfigurationCommand({
    Bucket,
    LifecycleConfiguration: {
      Rules: [
        ...others,
        {
          ID: "expire-quarantine",
          Status: "Enabled",
          Filter: { Prefix: QUARANTINE_PREFIX },
          Expiration: { Days: QUARANTINE_EXPIRY_DAYS },
        },
      ],
    },
  }));
  console.log(`lifecycle: quarantine/ objects expire after ${QUARANTINE_EXPIRY_DAYS} days (rule "expire-quarantine").`);
  console.log("Restore any file with: aws s3 cp s3://" + Bucket + "/quarantine/<key> s3://" + Bucket + "/<key> (or CopyObject).");

  await mongo.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
