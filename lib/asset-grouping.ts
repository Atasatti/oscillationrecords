// Pure helpers for the Asset library's grouped views: bucket assets by a chosen
// dimension (release / artist / month / type), and turn a release bucket into a
// flat list of download actions. Generic over the asset shape so callers keep
// their richer row type (for rendering) while this stays structurally decoupled.

export type GroupMode = "release" | "artist" | "month" | "type";

export type GroupableAsset = {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  /** Same-origin href that forces a real download (see AssetsClient.Asset). */
  downloadHref: string;
  releaseId: string | null;
  artistId: string | null;
  parentLabel: string | null;
  parentHref: string | null;
  createdAt: string;
};

export type AssetGroup<T extends GroupableAsset = GroupableAsset> = {
  key: string;
  kind: GroupMode;
  /** release/artist id when the group maps to a record (drives the link + download control); null for month/type/catch-all. */
  entityId: string | null;
  name: string;
  href: string | null;
  assets: T[];
};

export type GroupContext = {
  releaseNames: Map<string, string>;
  artistNames: Map<string, string>;
  /** release id → its (first) primary artist id, so release assets group under an artist too. */
  releaseArtistId: Map<string, string>;
  categoryLabels: Record<string, string>;
};

export type DownloadItem = { label: string; href: string; downloadName?: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function groupAssets<T extends GroupableAsset>(
  assets: T[],
  mode: GroupMode,
  ctx: GroupContext
): AssetGroup<T>[] {
  const groups = new Map<string, AssetGroup<T>>();
  const put = (meta: Omit<AssetGroup<T>, "assets">, asset: T) => {
    const existing = groups.get(meta.key);
    if (existing) existing.assets.push(asset);
    else groups.set(meta.key, { ...meta, assets: [asset] });
  };

  for (const a of assets) {
    if (mode === "release") {
      if (a.releaseId) {
        put({
          key: `release:${a.releaseId}`, kind: "release", entityId: a.releaseId,
          name: ctx.releaseNames.get(a.releaseId) ?? a.parentLabel ?? "Untitled release",
          href: a.parentHref ?? `/admin/release/${a.releaseId}`,
        }, a);
      } else {
        put({ key: "none", kind: "release", entityId: null, name: "Not linked to a release", href: null }, a);
      }
    } else if (mode === "artist") {
      const artistId = a.artistId ?? (a.releaseId ? ctx.releaseArtistId.get(a.releaseId) ?? null : null);
      if (artistId) {
        put({
          key: `artist:${artistId}`, kind: "artist", entityId: artistId,
          name: ctx.artistNames.get(artistId) ?? "Unknown artist",
          href: `/admin/artist/${artistId}`,
        }, a);
      } else {
        put({ key: "none", kind: "artist", entityId: null, name: "No artist", href: null }, a);
      }
    } else if (mode === "month") {
      const d = new Date(a.createdAt);
      if (Number.isNaN(d.getTime())) {
        put({ key: "none", kind: "month", entityId: null, name: "Unknown date", href: null }, a);
      } else {
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        put({
          key: `month:${y}-${String(m + 1).padStart(2, "0")}`, kind: "month", entityId: null,
          name: `${MONTHS[m] ?? "?"} ${y}`, href: null,
        }, a);
      }
    } else {
      put({
        key: `type:${a.category}`, kind: "type", entityId: null,
        name: ctx.categoryLabels[a.category] ?? a.category, href: null,
      }, a);
    }
  }

  return [...groups.values()].sort((x, y) => {
    // The catch-all "none" bucket (no release / no artist / unknown date) always sorts last.
    const xNone = x.key === "none";
    const yNone = y.key === "none";
    if (xNone !== yNone) return xNone ? 1 : -1;
    // Month: most recent first (keys are zero-padded YYYY-MM). Others: by name.
    if (mode === "month") return x.key < y.key ? 1 : x.key > y.key ? -1 : 0;
    return x.name.localeCompare(y.name);
  });
}

export function buildDownloadItems(
  group: AssetGroup,
  lyrics: { txt: boolean; lrc: boolean } | undefined,
  categoryLabels: Record<string, string>
): DownloadItem[] {
  const counts = new Map<string, number>();
  for (const asset of group.assets) {
    counts.set(asset.category, (counts.get(asset.category) ?? 0) + 1);
  }
  const items: DownloadItem[] = group.assets.map((asset) => {
    const catLabel = categoryLabels[asset.category] ?? asset.category;
    const disambiguate = (counts.get(asset.category) ?? 0) > 1;
    return {
      label: disambiguate ? `Download ${catLabel} — ${asset.title || asset.fileName}` : `Download ${catLabel}`,
      href: asset.downloadHref,
      downloadName: asset.fileName,
    };
  });
  if (group.kind === "release" && group.entityId && lyrics) {
    if (lyrics.txt) items.push({ label: "Download lyrics (.txt)", href: `/api/releases/${group.entityId}/lyrics?format=txt` });
    if (lyrics.lrc) items.push({ label: "Download lyrics (.lrc)", href: `/api/releases/${group.entityId}/lyrics?format=lrc` });
  }
  return items;
}
