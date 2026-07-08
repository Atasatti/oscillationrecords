// Reads tracks whose lyrics are empty and writes lyric-candidates.json:
//   [{ trackId, name, primaryArtist, isrc }]
// READ-ONLY — makes no writes. Feeds scripts/musixmatch-pull-lyrics.py.
//
// Run (PowerShell): $env:NODE_OPTIONS="--use-system-ca"; node scripts/export-lyric-candidates.mjs
// Run (bash):       NODE_OPTIONS=--use-system-ca node scripts/export-lyric-candidates.mjs
//
// NOTE: local .env points at the LIVE database. This script only reads.
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();

try {
  const tracks = await prisma.track.findMany({
    where: { OR: [{ lyrics: null }, { lyrics: "" }] },
    select: { id: true, name: true, isrcCode: true, primaryArtistIds: true },
  });

  const ids = [...new Set(tracks.flatMap((t) => t.primaryArtistIds ?? []))];
  const artists = ids.length
    ? await prisma.artist.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(artists.map((a) => [a.id, a.name]));

  const candidates = tracks.map((t) => ({
    trackId: t.id,
    name: t.name,
    primaryArtist: (t.primaryArtistIds ?? [])
      .map((id) => nameById.get(id))
      .filter(Boolean)
      .join(", "),
    isrc: t.isrcCode ?? null,
  }));

  writeFileSync("lyric-candidates.json", JSON.stringify(candidates, null, 2));
  console.log(`Wrote ${candidates.length} candidates to lyric-candidates.json`);
} finally {
  await prisma.$disconnect();
}
