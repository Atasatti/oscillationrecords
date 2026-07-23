// Audit #1 verification — READ-ONLY. Samples a real object under every prefix in
// the bucket and reports what an ANONYMOUS caller gets for it, so the public /
// private split can be checked against reality rather than against the policy
// text. Public site media must stay 200/206; every private prefix must be 403.
//
//   node --env-file=.env --use-system-ca scripts/s3-verify-private-prefixes.mjs
//
// Writes nothing. Safe to run against production at any time.

import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

const isPrivate = (key) => PRIVATE_PREFIXES.some((p) => key.startsWith(p));
const objectUrl = (key) =>
  `https://${Bucket}.s3.${region}.amazonaws.com/${key.split("/").map(encodeURIComponent).join("/")}`;

async function main() {
  // One sample key per top-level-ish prefix, so every namespace is covered.
  const samples = new Map();
  let token;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }));
    for (const o of r.Contents ?? []) {
      const parts = o.Key.split("/");
      const group = parts.length > 2 ? `${parts[0]}/${parts[1]}/` : parts.length > 1 ? `${parts[0]}/` : "(root)";
      if (!samples.has(group)) samples.set(group, o.Key);
    }
    token = r.NextContinuationToken;
  } while (token);

  let failures = 0;
  for (const [group, key] of [...samples].sort((a, b) => a[0].localeCompare(b[0]))) {
    let status;
    try {
      // Range-limited so verification never pulls a multi-GB master.
      status = (await fetch(objectUrl(key), { headers: { Range: "bytes=0-0" } })).status;
    } catch (e) {
      status = `ERR ${e.message}`;
    }
    const wantPrivate = isPrivate(key);
    const ok = wantPrivate ? status === 403 : status === 200 || status === 206;
    if (!ok) failures++;
    console.log(
      `${ok ? "ok  " : "FAIL"}  ${wantPrivate ? "private" : "public "}  ${String(status).padEnd(5)}  ${group}`
    );
  }

  console.log(
    failures === 0
      ? "\nAll prefixes match the intended public/private split."
      : `\n${failures} prefix(es) do NOT match the intended split — see FAIL rows above.`
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
