// Automated S3 exposure check (added after the 2026-07-24 incident: 12
// unreleased masters under tracks/audio/ were anonymously downloadable).
// Fails (exit 1) if any object that must be private is anonymously readable.
//
//   node --use-system-ca --env-file=.env scripts/check-s3-exposure.mjs
//   (or: npm run check:s3-exposure)
//
// HARD checks — any hit fails the run:
//   1. For every PRIVATE_KEY_PREFIXES entry (parsed from lib/s3-url.ts so the
//      list can't drift), one real object under the prefix must return 403 to
//      an anonymous GET (skipped when the prefix holds no objects).
//      tracks/audio/ is excluded here pre-flip — see check 2.
//   2. EVERY tracks/audio/ object referenced by a NON-public release (DRAFT /
//      future-dated SCHEDULED) must return 403 anonymously — plain and Range.
//      This is exactly the incident class, and it must hold both before the
//      bucket-wide tracks/audio/* deny is applied (temp per-key statement) and
//      after (prefix deny).
// WARNING (non-fatal): private prefixes missing from the bucket policy's
// anonymous-read Deny — expected for tracks/audio/ until the DEPLOY.md
// merge-day flip, a real drift signal for anything else.
import { readFileSync } from "node:fs";
import { MongoClient } from "mongodb";
import { S3Client, ListObjectsV2Command, GetBucketPolicyCommand } from "@aws-sdk/client-s3";

const Bucket = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";
const region = process.env.AWS_REGION || "us-east-1";
const base = `https://${Bucket}.s3.${region}.amazonaws.com/`;
const s3 = new S3Client({ region });

// --- The private-prefix list, from the one source of truth (lib/s3-url.ts).
const src = readFileSync(new URL("../lib/s3-url.ts", import.meta.url), "utf8");
// Anchor on the `] as const` terminator — a bare `]` can appear inside the
// array's comments (e.g. the /api/tracks/[trackId]/audio route path) — and drop
// comment lines before extracting strings so commented text can't add entries.
const block = src.match(/PRIVATE_KEY_PREFIXES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/)?.[1];
if (!block) throw new Error("could not parse PRIVATE_KEY_PREFIXES from lib/s3-url.ts");
const privatePrefixes = block
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .flatMap((line) => [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
if (!privatePrefixes.includes("tracks/audio/")) {
  // The incident prefix silently missing means the parse (or the list) broke.
  throw new Error(`parsed PRIVATE_KEY_PREFIXES looks wrong: ${JSON.stringify(privatePrefixes)}`);
}

const anonStatus = async (key, range) => {
  const r = await fetch(base + encodeURI(key).replace(/[#?]/g, (c) => encodeURIComponent(c)), {
    headers: range ? { Range: "bytes=0-9" } : {},
  });
  r.body?.cancel?.();
  return r.status;
};

const failures = [];
const warnings = [];

// --- 1. One real object per private prefix must be anonymous-403.
for (const prefix of privatePrefixes) {
  if (prefix === "tracks/audio/") continue; // handled release-aware in check 2
  const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 1 }));
  const key = page.Contents?.[0]?.Key;
  if (!key) { console.log(`  (no objects under ${prefix} — skipped)`); continue; }
  const status = await anonStatus(key);
  console.log(`  ${status === 403 ? "ok " : "!! "} ${status} ${key}`);
  if (status !== 403) failures.push(`${prefix} object anonymously readable (${status}): ${key}`);
}

// --- 2. Every unreleased-release audio object must be anonymous-403.
const mongo = new MongoClient(process.env.DATABASE_URL);
await mongo.connect();
const db = mongo.db();
const releases = await db
  .collection("Release")
  .find({}, { projection: { status: 1, releaseDate: 1 } })
  .toArray();
const isPublic = (r) =>
  r.status === "RELEASED" ||
  (r.status === "SCHEDULED" && r.releaseDate && new Date(r.releaseDate).getTime() <= Date.now());
const nonPublic = new Set(releases.filter((r) => !isPublic(r)).map((r) => String(r._id)));
const tracks = await db
  .collection("Track")
  .find({ audioFile: { $regex: "^https://" } }, { projection: { audioFile: 1, releaseId: 1 } })
  .toArray();
await mongo.close();

const unreleasedKeys = new Set();
for (const t of tracks) {
  if (!nonPublic.has(String(t.releaseId))) continue;
  try {
    const u = new URL(t.audioFile);
    if (!u.hostname.startsWith(`${Bucket}.s3`)) continue;
    unreleasedKeys.add(decodeURIComponent(u.pathname.replace(/^\/+/, "")));
  } catch {}
}
console.log(`\nunreleased-release audio objects to verify: ${unreleasedKeys.size}`);
for (const key of unreleasedKeys) {
  const [plain, range] = await Promise.all([anonStatus(key), anonStatus(key, true)]);
  const ok = plain === 403 && range === 403;
  console.log(`  ${ok ? "ok " : "!! "} plain=${plain} range=${range} ${key}`);
  if (!ok) failures.push(`UNRELEASED master anonymously readable (plain=${plain} range=${range}): ${key}`);
}

// --- 3. Policy parity (warning): every private prefix should be in the Deny.
try {
  const policy = JSON.parse((await s3.send(new GetBucketPolicyCommand({ Bucket }))).Policy);
  const denyResources = policy.Statement.filter(
    (s) => s.Effect === "Deny" && s.Condition?.Null?.["aws:PrincipalArn"] === "true"
  ).flatMap((s) => (Array.isArray(s.Resource) ? s.Resource : [s.Resource]));
  for (const prefix of privatePrefixes) {
    const covered = denyResources.some(
      (r) => r === `arn:aws:s3:::${Bucket}/${prefix}*` || r === `arn:aws:s3:::${Bucket}/*`
    );
    if (!covered) {
      warnings.push(
        `prefix not in the bucket policy's anonymous Deny: ${prefix}` +
          (prefix === "tracks/audio/" ? " (expected until the DEPLOY.md merge-day flip)" : "")
      );
    }
  }
} catch (e) {
  warnings.push(`could not read bucket policy for parity check: ${e.message}`);
}

for (const w of warnings) console.warn(`\nWARN: ${w}`);
if (failures.length) {
  console.error(`\nEXPOSURE — ${failures.length} failure(s):`);
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
console.log("\nNo anonymous exposure detected.");
