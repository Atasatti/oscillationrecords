import { prisma } from "@/lib/prisma";
import { fileNameFromUrl, guessMimeFromUrl } from "@/lib/asset";
import AssetsClient, { type Asset, type Option } from "./AssetsClient";

export const dynamic = "force-dynamic";

type DerivedInput = {
  id: string;
  category: string;
  title: string;
  url: string | null | undefined;
  source: Asset["source"];
  parentHref: string;
  parentLabel: string;
  createdAt: string;
  releaseId?: string;
  artistId?: string;
};

export default async function AssetsPage() {
  let assets: Asset[] = [];
  let releases: Option[] = [];
  let artists: Option[] = [];
  let releaseLyrics: Record<string, { txt: boolean; lrc: boolean }> = {};
  try {
    const [rows, rels, arts, press] = await Promise.all([
      prisma.asset.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.release.findMany({
        select: {
          id: true, name: true, coverImage: true, createdAt: true,
          tracks: { select: { id: true, name: true, audioFile: true, stemsFile: true, image: true, lyrics: true, syncedLyrics: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.artist.findMany({ select: { id: true, name: true, profilePicture: true, createdAt: true }, orderBy: { name: "asc" } }),
      prisma.pressItem
        .findMany({ select: { id: true, title: true, image: true, createdAt: true }, orderBy: { createdAt: "desc" } })
        .catch(() => [] as { id: string; title: string; image: string | null; createdAt: Date }[]),
    ]);

    const uploaderIds = [...new Set(rows.map((r) => r.uploadedById).filter((v): v is string => !!v))];
    const users = uploaderIds.length
      ? await prisma.user.findMany({ where: { id: { in: uploaderIds } }, select: { id: true, name: true, email: true } })
      : [];
    const uploaderName = new Map(users.map((u) => [u.id, u.name || u.email || "Unknown"]));

    // Files uploaded directly through the DAM (editable/deletable).
    const damAssets: Asset[] = rows.map((a) => ({
      id: a.id, category: a.category, title: a.title, fileName: a.fileName, fileUrl: a.fileUrl,
      mimeType: a.mimeType, size: a.size, releaseId: a.releaseId, artistId: a.artistId, notes: a.notes,
      createdAt: a.createdAt.toISOString(), uploader: a.uploadedById ? uploaderName.get(a.uploadedById) ?? null : null,
      source: "upload", readOnly: false, parentHref: null, parentLabel: null,
    }));

    // Everything the label already has, read live from the catalog — release
    // covers, track audio/stems/art, artist photos, press images. Read-only here
    // (managed on the parent record); deduped against DAM uploads by URL.
    const seen = new Set(damAssets.map((a) => a.fileUrl));
    const derived: Asset[] = [];
    const add = (d: DerivedInput) => {
      if (!d.url || seen.has(d.url)) return;
      seen.add(d.url);
      derived.push({
        id: d.id, category: d.category, title: d.title, fileName: fileNameFromUrl(d.url), fileUrl: d.url,
        mimeType: guessMimeFromUrl(d.url), size: 0, releaseId: d.releaseId ?? null, artistId: d.artistId ?? null,
        notes: null, createdAt: d.createdAt, uploader: null, source: d.source, readOnly: true,
        parentHref: d.parentHref, parentLabel: d.parentLabel,
      });
    };

    for (const r of rels) {
      const createdAt = r.createdAt.toISOString();
      const parentHref = `/admin/catalog/releases/${r.id}/edit`;
      add({ id: `rel-cover-${r.id}`, category: "artwork", title: `${r.name} — cover`, url: r.coverImage, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
      for (const t of r.tracks) {
        add({ id: `trk-aud-${t.id}`, category: "master", title: `${t.name} — master`, url: t.audioFile, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
        add({ id: `trk-stm-${t.id}`, category: "stems", title: `${t.name} — stems`, url: t.stemsFile, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
        add({ id: `trk-img-${t.id}`, category: "artwork", title: `${t.name} — art`, url: t.image, source: "release", parentHref, parentLabel: r.name, createdAt, releaseId: r.id });
      }
    }
    for (const a of arts) {
      add({ id: `art-photo-${a.id}`, category: "press_photo", title: `${a.name} — photo`, url: a.profilePicture, source: "artist", parentHref: `/admin/catalog/artists/${a.id}/edit`, parentLabel: a.name, createdAt: a.createdAt.toISOString(), artistId: a.id });
    }
    for (const p of press) {
      add({ id: `press-${p.id}`, category: "press_photo", title: p.title || "Press image", url: p.image, source: "press", parentHref: `/admin/catalog/press/${p.id}/edit`, parentLabel: p.title || "Press", createdAt: p.createdAt.toISOString() });
    }

    assets = [...damAssets, ...derived];
    releases = rels.map((r) => ({ id: r.id, name: r.name }));
    artists = arts.map((a) => ({ id: a.id, name: a.name }));

    releaseLyrics = {};
    for (const r of rels) {
      const txt = r.tracks.some((t) => (t.lyrics ?? "").trim() !== "");
      const lrc = r.tracks.some((t) => (t.syncedLyrics ?? "").trim() !== "");
      if (txt || lrc) releaseLyrics[r.id] = { txt, lrc };
    }
  } catch {
    // Empty library on a transient DB error.
  }
  return <AssetsClient initial={assets} releases={releases} artists={artists} releaseLyrics={releaseLyrics} />;
}
