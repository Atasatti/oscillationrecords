// Asset library / DAM (Asset) — files (masters, artwork, stems, press photos,
// EPKs) stored on our own S3 bucket under the "assets/" prefix, with metadata in
// Mongo. Pure — safe to import on server or client.

export const ASSET_PREFIX = "assets/";

export const ASSET_CATEGORIES = [
  "master", "artwork", "stems", "press_photo", "epk", "document", "other",
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  master: "Master",
  artwork: "Artwork",
  stems: "Stems",
  press_photo: "Press photo",
  epk: "EPK",
  document: "Document",
  other: "Other",
};

export function isAssetCategory(v: unknown): v is AssetCategory {
  return typeof v === "string" && (ASSET_CATEGORIES as readonly string[]).includes(v);
}

// Single-PUT presigned uploads, so cap below S3's 5GB single-object limit; a
// full master or a stems zip can be large, hence 1GB.
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024; // 1 GB

// Broad allowlist for a label DAM: audio (masters/stems), raster images
// (artwork/press), PDF (EPKs/docs), zip (stem bundles), and common video.
// Deliberately EXCLUDES image/svg+xml and text/html — served from the public
// bucket, either can execute script when navigated directly.
const ALLOWED_IMAGE: readonly string[] = [
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/tiff", "image/avif", "image/bmp",
];
const ALLOWED_EXACT: readonly string[] = [
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

export function isAllowedAssetType(t: unknown): boolean {
  if (typeof t !== "string") return false;
  // Strip any "; charset=…" parameter first, so "image/svg+xml; charset=utf-8"
  // can't slip past the SVG block. Then allow raster images from an explicit set
  // (never image/*), audio (subtypes aren't script-capable), and a few exacts.
  const type = t.toLowerCase().split(";")[0].trim();
  if (!type || type === "image/svg+xml" || type === "text/html") return false;
  if (/^audio\//.test(type)) return true;
  if (ALLOWED_IMAGE.includes(type)) return true;
  return ALLOWED_EXACT.includes(type);
}

export const ASSET_ACCEPT =
  "audio/*,image/png,image/jpeg,image/webp,image/gif,image/tiff,.pdf,.zip,video/mp4,video/quicktime,video/webm";

export const assetStr = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export function objectIdOrNull(v: unknown): string | null {
  return typeof v === "string" && /^[a-f\d]{24}$/i.test(v) ? v : null;
}

/** Human-readable file size (e.g. "4.2 MB"). */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
