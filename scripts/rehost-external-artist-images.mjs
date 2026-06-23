// One-off backfill: copy every artist photo that's hosted OFF our S3 bucket
// (e.g. a Spotify i.scdn.co URL pulled in during import) INTO our bucket, and
// repoint profilePicture at the new URL. This makes the image file ours, which
// is what lets it rank/attribute to our pages in Google Images and be listed in
// the image sitemap. Going forward, the artist POST/PUT routes do this on save
// (rehostExternalImage in lib/s3.ts); this script fixes pre-existing rows.
//
// Dry-run (default, no writes):
//   node --env-file=.env --use-system-ca scripts/rehost-external-artist-images.mjs
// Apply for real:
//   node --env-file=.env --use-system-ca scripts/rehost-external-artist-images.mjs --apply
//
// Idempotent: already-on-bucket photos are skipped; safe to re-run.

import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";
const OWN_HOST = `${BUCKET}.s3.${REGION}.amazonaws.com`;

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const s3 =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

function isOwnBucket(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === OWN_HOST;
  } catch {
    return false;
  }
}

function slugify(name) {
  return (
    String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image"
  );
}

async function rehost(url, name) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!/^image\//i.test(contentType)) throw new Error(`not an image (${contentType})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 15 * 1024 * 1024) {
    throw new Error(`bad size ${bytes.length}`);
  }
  const ext = EXT_BY_TYPE[contentType] || "jpg";
  const key = `artists/images/${slugify(name)}-${Date.now()}.${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  return `https://${OWN_HOST}/${key}`;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}  Bucket: ${OWN_HOST}\n`);
  if (APPLY && !s3) {
    console.error("AWS credentials not set — cannot upload. Aborting.");
    process.exit(1);
  }

  const artists = await prisma.artist.findMany({
    select: { id: true, name: true, profilePicture: true },
  });

  const external = artists.filter(
    (a) => a.profilePicture && /^https?:\/\//i.test(a.profilePicture) && !isOwnBucket(a.profilePicture)
  );
  console.log(`${artists.length} artists; ${external.length} with an OFF-bucket photo.\n`);

  let done = 0;
  let failed = 0;
  for (const a of external) {
    const host = (() => { try { return new URL(a.profilePicture).host; } catch { return "?"; } })();
    if (!APPLY) {
      console.log(`• ${a.name}: would re-host from ${host}`);
      continue;
    }
    try {
      const newUrl = await rehost(a.profilePicture, a.name);
      await prisma.artist.update({ where: { id: a.id }, data: { profilePicture: newUrl } });
      console.log(`✓ ${a.name}: ${host} → ${newUrl}`);
      done++;
    } catch (e) {
      console.error(`✗ ${a.name}: ${e.message} (left unchanged)`);
      failed++;
    }
  }

  console.log(
    `\nDone. ${APPLY ? `re-hosted ${done}, failed ${failed}` : `${external.length} would be re-hosted (dry-run)`}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
