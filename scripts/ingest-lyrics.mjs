// Writes reviewed lyrics into Track.lyrics. DB ONLY — no network.
// Fills ONLY empty lyrics; never overwrites. Dry-run by default.
//
//   node --use-system-ca scripts/ingest-lyrics.mjs           # dry run (default)
//   node --use-system-ca scripts/ingest-lyrics.mjs --write   # persist
//
// NOTE: local .env points at the LIVE database. Review lyrics-review.json first.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { shouldFillLyrics, normalizeLyrics } from "./lib/lyrics-ingest.mjs";

const WRITE = process.argv.includes("--write");
const prisma = new PrismaClient();

try {
  const review = JSON.parse(readFileSync("lyrics-review.json", "utf-8"));
  let toFill = 0;
  let skippedPresent = 0;
  let skippedNoMatch = 0;

  for (const r of review) {
    const incoming = normalizeLyrics(r.lyricsBody);
    if (!incoming) {
      skippedNoMatch++;
      continue;
    }
    const track = await prisma.track.findUnique({
      where: { id: r.trackId },
      select: { lyrics: true, name: true },
    });
    if (!track) {
      skippedNoMatch++;
      continue;
    }
    if (!shouldFillLyrics(track.lyrics, incoming)) {
      skippedPresent++;
      continue;
    }
    toFill++;
    console.log(`${WRITE ? "WRITE" : "DRY  "} ${track.name} — ${incoming.length} chars`);
    if (WRITE) {
      await prisma.track.update({ where: { id: r.trackId }, data: { lyrics: incoming } });
    }
  }

  console.log(
    `\n${WRITE ? "Wrote" : "Would fill"} ${toFill}; skipped ${skippedPresent} already-present, ${skippedNoMatch} no-match.`
  );
  if (!WRITE) console.log("Dry run — re-run with --write to persist.");
} finally {
  await prisma.$disconnect();
}
