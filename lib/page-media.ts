import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STACKED_HERO_IMAGES } from "@/lib/site-settings-defaults";
import {
  DEFAULT_PAGE_MEDIA,
  mergePageMedia,
  type PageMedia,
} from "@/lib/page-media-defaults";

// Server-side reader/writer for the editable page-media blob. We store it as a
// single `pageMedia` sub-document on the existing SiteSettings row (id "site")
// via raw Mongo commands, so adding these fields needs NO Prisma schema change
// or client regeneration — important while the schema is shared across work.

const COLLECTION = "SiteSettings";
const DOC_ID = "site";

type RawFind = { cursor?: { firstBatch?: Array<Record<string, unknown>> } };

async function readStored(): Promise<Partial<PageMedia>> {
  const res = (await prisma.$runCommandRaw({
    find: COLLECTION,
    filter: { _id: DOC_ID },
    limit: 1,
  })) as unknown as RawFind;
  const doc = res?.cursor?.firstBatch?.[0];
  return (doc?.pageMedia ?? {}) as Partial<PageMedia>;
}

/** The effective page media (stored overrides merged over built-in defaults). */
export async function getPageMedia(): Promise<PageMedia> {
  try {
    return mergePageMedia(await readStored());
  } catch (e) {
    console.error("getPageMedia: DB unavailable, using defaults", e);
    return { ...DEFAULT_PAGE_MEDIA };
  }
}

/**
 * Merge a partial patch into the stored pageMedia blob (admin save). Only the
 * provided keys change; everything else is preserved. Returns the new effective
 * media (merged over defaults).
 */
export async function savePageMedia(patch: Partial<PageMedia>): Promise<PageMedia> {
  const current = await readStored();
  const next = { ...current, ...patch };

  // Ensure the singleton SiteSettings row exists (with its required non-null
  // fields) BEFORE the raw $set. A raw Mongo `update` without `upsert` matches
  // zero docs on a fresh row, so the first-ever page-media save would otherwise
  // be silently lost while the UI reports success.
  await prisma.siteSettings.upsert({
    where: { id: DOC_ID },
    create: {
      id: DOC_ID,
      stackedHeroImage1: DEFAULT_STACKED_HERO_IMAGES.image1,
      stackedHeroImage2: DEFAULT_STACKED_HERO_IMAGES.image2,
      stackedHeroImage3: DEFAULT_STACKED_HERO_IMAGES.image3,
    },
    update: {},
  });

  await prisma.$runCommandRaw({
    update: COLLECTION,
    updates: [{ q: { _id: DOC_ID }, u: { $set: { pageMedia: next as unknown as Prisma.InputJsonValue } } }],
  });
  return mergePageMedia(next);
}
