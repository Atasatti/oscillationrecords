// Pure helpers for the Asset library's "By release" view: bucket assets by their
// linked entity and turn a bucket into a flat list of download actions.

export type GroupableAsset = {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl: string;
  releaseId: string | null;
  artistId: string | null;
  parentLabel: string | null;
  parentHref: string | null;
};

export type AssetGroup = {
  key: string;
  kind: "release" | "artist" | "unlinked";
  entityId: string | null;
  name: string;
  href: string | null;
  assets: GroupableAsset[];
};

export type DownloadItem = { label: string; href: string; downloadName?: string };

export function groupAssets(
  assets: GroupableAsset[],
  names: { releases: Map<string, string>; artists: Map<string, string> }
): AssetGroup[] {
  const groups = new Map<string, AssetGroup>();
  for (const asset of assets) {
    let g: Omit<AssetGroup, "assets">;
    if (asset.releaseId) {
      g = {
        key: `release:${asset.releaseId}`,
        kind: "release",
        entityId: asset.releaseId,
        name: names.releases.get(asset.releaseId) ?? asset.parentLabel ?? "Untitled release",
        href: asset.parentHref ?? `/admin/catalog/release/${asset.releaseId}`,
      };
    } else if (asset.artistId) {
      g = {
        key: `artist:${asset.artistId}`,
        kind: "artist",
        entityId: asset.artistId,
        name: names.artists.get(asset.artistId) ?? asset.parentLabel ?? "Unknown artist",
        href: asset.parentHref ?? `/admin/catalog/artist/${asset.artistId}`,
      };
    } else {
      g = { key: "unlinked", kind: "unlinked", entityId: null, name: "Not linked to a release", href: null };
    }
    const existing = groups.get(g.key);
    if (existing) existing.assets.push(asset);
    else groups.set(g.key, { ...g, assets: [asset] });
  }
  const rank = (k: AssetGroup["kind"]) => (k === "release" ? 0 : k === "artist" ? 1 : 2);
  return [...groups.values()].sort(
    (x, y) => rank(x.kind) - rank(y.kind) || x.name.localeCompare(y.name)
  );
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
      href: asset.fileUrl,
      downloadName: asset.fileName,
    };
  });
  if (group.kind === "release" && group.entityId && lyrics) {
    if (lyrics.txt) items.push({ label: "Download lyrics (.txt)", href: `/api/releases/${group.entityId}/lyrics?format=txt` });
    if (lyrics.lrc) items.push({ label: "Download lyrics (.lrc)", href: `/api/releases/${group.entityId}/lyrics?format=lrc` });
  }
  return items;
}
