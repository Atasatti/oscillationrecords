// Audit #1 — stop the S3 bucket serving SENSITIVE objects to anonymous callers.
//
// The bucket policy today is a single blanket grant:
//   { Effect: Allow, Principal: "*", Action: "s3:GetObject", Resource: "…/*" }
// so contact-form attachments, task attachments, signed agreements and
// competition entries are world-readable to anyone who learns (or guesses) a key.
//
// This script ADDS an explicit Deny for the private prefixes, keeping the public
// Allow untouched. An explicit Deny always beats an Allow in IAM, and the
// condition `Null: { "aws:PrincipalArn": "true" }` means it fires ONLY for
// unauthenticated requests — signed calls (the app's IAM user, and therefore
// every presigned URL it mints for /api/assets/download) are unaffected. Adding a
// Deny rather than replacing the Allow with an enumerated public list is
// deliberate: a public prefix accidentally left off an allow-list would 404 the
// live site, whereas a private prefix left off this deny-list simply stays as
// exposed as it is today.
//
// Dry-run (default, prints the before/after policy, writes nothing):
//   node --env-file=.env --use-system-ca scripts/s3-lock-private-prefixes.mjs
// Apply for real:
//   node --env-file=.env --use-system-ca scripts/s3-lock-private-prefixes.mjs --apply
// Roll back (restore the previous policy printed by the apply run):
//   node --env-file=.env --use-system-ca scripts/s3-lock-private-prefixes.mjs --revert
//
// ORDER MATTERS: deploy the app code that routes private files through
// /api/assets/download FIRST. Applying this against a deployment that still
// renders raw bucket URLs breaks the admin's contract/attachment links.

import {
  S3Client,
  GetBucketPolicyCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";

const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert");
const SID = "DenyAnonymousReadPrivatePrefixes";

// Must stay in sync with PRIVATE_KEY_PREFIXES in lib/s3-url.ts.
const PRIVATE_PREFIXES = [
  "assets/",
  "benert-remix/",
  "contact/",
  "documents/",
  "quarantine/",
  "releases/agreements/",
  "task-attachments/",
  "tracks/stems/",
];

const Bucket = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";
const region = process.env.AWS_REGION || "us-east-1";

const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function denyStatement() {
  return {
    Sid: SID,
    Effect: "Deny",
    Principal: "*",
    Action: "s3:GetObject",
    Resource: PRIVATE_PREFIXES.map((p) => `arn:aws:s3:::${Bucket}/${p}*`),
    // Only anonymous requests carry no principal ARN. Signed requests — including
    // the presigned GETs the app mints after authorizing the caller — are exempt.
    Condition: { Null: { "aws:PrincipalArn": "true" } },
  };
}

async function main() {
  console.log(`Bucket: ${Bucket} (${region})`);
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : REVERT ? "REVERT (writing)" : "DRY-RUN (no writes)"}\n`);

  let current = null;
  try {
    const r = await s3.send(new GetBucketPolicyCommand({ Bucket }));
    current = JSON.parse(r.Policy);
  } catch (e) {
    if (e.name !== "NoSuchBucketPolicy") throw e;
  }
  console.log("--- current policy ---");
  console.log(current ? JSON.stringify(current, null, 2) : "(none)");

  const statements = current?.Statement ?? [];
  const next = {
    Version: "2012-10-17",
    Statement: REVERT
      ? statements.filter((s) => s.Sid !== SID)
      : [...statements.filter((s) => s.Sid !== SID), denyStatement()],
  };

  if (!REVERT && !next.Statement.some((s) => s.Effect === "Allow")) {
    console.error(
      "\nRefusing to write: the resulting policy has no Allow statement, which would\n" +
        "take the public site's images and audio offline. Inspect the policy above."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n--- proposed policy ---");
  console.log(JSON.stringify(next, null, 2));

  if (!APPLY && !REVERT) {
    console.log("\nDry run — nothing written. Re-run with --apply to write this policy.");
    return;
  }

  await s3.send(new PutBucketPolicyCommand({ Bucket, Policy: JSON.stringify(next) }));
  console.log("\nPolicy written. Verify with scripts/s3-verify-private-prefixes.mjs.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
