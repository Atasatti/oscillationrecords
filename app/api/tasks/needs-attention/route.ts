import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { computeArtistSeo, computeReleaseSeo } from "@/lib/seo-score";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type AttentionItem = {
  id: string;
  type: "artist" | "release" | "catalog" | "system";
  title: string;
  detail: string;
  href: string;
  priority: "high" | "medium" | "low";
};

// "Earned" external identifiers an artist can't just create on demand — a
// Wikipedia article has to be merited, an ISNI requires registration, and a
// MusicBrainz / Wikidata entry depends on outside catalogues. They still feed
// the SEO/GKP scores, but we don't surface them as action items in "Needs
// attention" (nor list them among a weak page's fixable gaps), since they're
// not something the label can sit down and do.
const EARNED_IDENTIFIERS = new Set([
  "MusicBrainz ID",
  "ISNI",
  "Wikipedia article",
  "Wikidata item",
]);

// GET /api/tasks/needs-attention
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const items: AttentionItem[] = [];

    const [artists, releases, unhandledMessages, drafts] = await Promise.all([
      prisma.artist.findMany({
        where: { showOnWebsite: true },
        select: {
          id: true,
          name: true,
          biography: true,
          profilePicture: true,
          genres: true,
          musicBrainzId: true,
          isni: true,
          contactEmail: true,
          spotifyLink: true,
          appleMusicLink: true,
          tidalLink: true,
          amazonMusicLink: true,
          soundcloudLink: true,
          youtubeLink: true,
          instagramLink: true,
          tiktokLink: true,
          xLink: true,
          facebookLink: true,
        },
      }),
      prisma.release.findMany({
        where: { status: "RELEASED" },
        select: {
          id: true,
          name: true,
          description: true,
          primaryGenre: true,
          secondaryGenre: true,
          coverImage: true,
          releaseDate: true,
          primaryArtistIds: true,
          spotifyLink: true,
          appleMusicLink: true,
          tidalLink: true,
          amazonMusicLink: true,
          youtubeLink: true,
          soundcloudLink: true,
          tracks: { select: { id: true } },
        },
      }),
      prisma.contactMessage.count({ where: { handled: false } }),
      prisma.release.count({ where: { status: "DRAFT" } }),
    ]);

    // Count releases per artist for SEO signal
    const releasesByArtist = new Map<string, number>();
    for (const r of releases) {
      for (const aid of r.primaryArtistIds) {
        releasesByArtist.set(aid, (releasesByArtist.get(aid) ?? 0) + 1);
      }
    }

    // Artist SEO checks
    for (const a of artists) {
      const linkCount = [
        a.spotifyLink, a.appleMusicLink, a.tidalLink, a.amazonMusicLink,
        a.soundcloudLink, a.youtubeLink, a.instagramLink, a.tiktokLink, a.xLink, a.facebookLink,
      ].filter(Boolean).length;

      const seo = computeArtistSeo({
        hasPhoto: !!a.profilePicture,
        bioLength: (a.biography ?? "").trim().length,
        genreCount: a.genres.length,
        linkCount,
        hasMusicBrainz: !!a.musicBrainzId,
        hasIsni: !!a.isni,
        releaseCount: releasesByArtist.get(a.id) ?? 0,
      });

      // Only show gaps the label can actually act on — drop the earned external
      // identifiers (MusicBrainz / ISNI / Wikipedia / Wikidata) from the list.
      const actionableMissing = seo.missing.filter((m) => !EARNED_IDENTIFIERS.has(m));

      if (seo.grade === "weak") {
        items.push({
          id: `artist-seo-${a.id}`,
          type: "artist",
          title: `${a.name} — weak SEO (${seo.score}/100)`,
          detail: actionableMissing.length
            ? `Missing: ${actionableMissing.slice(0, 3).join(", ")}`
            : "Add more profile detail to strengthen the page",
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "high",
        });
      } else if (seo.grade === "good" && actionableMissing.length > 0) {
        items.push({
          id: `artist-seo-good-${a.id}`,
          type: "artist",
          title: `${a.name} — SEO could be stronger (${seo.score}/100)`,
          detail: `Quick wins: ${actionableMissing.slice(0, 2).join(", ")}`,
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "medium",
        });
      }

      if (!a.contactEmail) {
        items.push({
          id: `artist-email-${a.id}`,
          type: "artist",
          title: `${a.name} — no contact email on file`,
          detail: "Internal use only — useful for booking and sync opportunities",
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "low",
        });
      }
    }

    // Release checks
    for (const r of releases) {
      const linkCount = [
        r.spotifyLink, r.appleMusicLink, r.tidalLink,
        r.amazonMusicLink, r.youtubeLink, r.soundcloudLink,
      ].filter(Boolean).length;

      const seo = computeReleaseSeo({
        hasCover: !!r.coverImage,
        descLength: (r.description ?? "").trim().length,
        genreCount: [r.primaryGenre, r.secondaryGenre].filter(Boolean).length,
        linkCount,
        trackCount: r.tracks.length,
        hasReleaseDate: !!r.releaseDate,
        hasPrimaryArtist: r.primaryArtistIds.length > 0,
      });

      if (seo.grade === "weak") {
        items.push({
          id: `release-seo-${r.id}`,
          type: "release",
          title: `"${r.name}" — weak release SEO (${seo.score}/100)`,
          detail: `Missing: ${seo.missing.slice(0, 3).join(", ")}`,
          href: `/admin/catalog/releases/${r.id}/edit`,
          priority: "high",
        });
      }

      if (!r.description?.trim()) {
        items.push({
          id: `release-desc-${r.id}`,
          type: "release",
          title: `"${r.name}" — no description`,
          detail: "A description improves search visibility and gives context on the release page",
          href: `/admin/catalog/releases/${r.id}/edit`,
          priority: "medium",
        });
      }

      if (!r.primaryGenre) {
        items.push({
          id: `release-genre-${r.id}`,
          type: "release",
          title: `"${r.name}" — no genre set`,
          detail: "Genre is used in release metadata and schema.org output",
          href: `/admin/catalog/releases/${r.id}/edit`,
          priority: "low",
        });
      }

      if (r.tracks.length === 0) {
        items.push({
          id: `release-tracks-${r.id}`,
          type: "release",
          title: `"${r.name}" — no tracks added`,
          detail: "Live release with no playable tracks",
          href: `/admin/catalog/releases/${r.id}/edit`,
          priority: "high",
        });
      }

      if (linkCount === 0) {
        items.push({
          id: `release-links-${r.id}`,
          type: "release",
          title: `"${r.name}" — no streaming links`,
          detail: "Add Spotify, Apple Music or other links so listeners can stream it",
          href: `/admin/catalog/releases/${r.id}/edit`,
          priority: "high",
        });
      }
    }

    // System-level
    if (unhandledMessages > 0) {
      items.push({
        id: "system-messages",
        type: "system",
        title: `${unhandledMessages} unread contact message${unhandledMessages > 1 ? "s" : ""}`,
        detail: "Messages submitted via the public Contact form",
        href: "/admin/messages",
        priority: "high",
      });
    }

    if (drafts > 0) {
      items.push({
        id: "system-drafts",
        type: "system",
        title: `${drafts} draft release${drafts > 1 ? "s" : ""} not yet published`,
        detail: "Finish adding tracks and metadata, then set to Scheduled or Released",
        href: "/admin/catalog/releases?status=DRAFT",
        priority: "medium",
      });
    }

    // Deduplicate: if an artist already has a "weak SEO" item, skip the separate
    // "no contact email" nudge for that same artist (it's a low-value extra).
    const weakArtistIds = new Set(
      items.filter((i) => i.id.startsWith("artist-seo-")).map((i) => i.id.replace("artist-seo-", ""))
    );
    // If a release is already flagged "weak SEO", its individual field gaps
    // (description / genre / tracks / links) are already named in that item's
    // detail — drop the standalone duplicates so each release appears once.
    const weakReleaseIds = new Set(
      items.filter((i) => i.id.startsWith("release-seo-")).map((i) => i.id.replace("release-seo-", ""))
    );
    const RELEASE_FIELD_PREFIXES = ["release-desc-", "release-genre-", "release-tracks-", "release-links-"];
    const deduped = items.filter((item) => {
      if (item.id.startsWith("artist-email-") && weakArtistIds.has(item.id.replace("artist-email-", ""))) return false;
      for (const p of RELEASE_FIELD_PREFIXES) {
        if (item.id.startsWith(p) && weakReleaseIds.has(item.id.replace(p, ""))) return false;
      }
      return true;
    });

    // Sort: unread contact messages first (time-sensitive inbound), then
    // high → medium → low.
    const ORDER = { high: 0, medium: 1, low: 2 };
    deduped.sort((a, b) => {
      const am = a.id === "system-messages" ? 0 : 1;
      const bm = b.id === "system-messages" ? 0 : 1;
      if (am !== bm) return am - bm;
      return ORDER[a.priority] - ORDER[b.priority];
    });

    return NextResponse.json({ items: deduped, total: deduped.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error building needs-attention list:", error);
    return NextResponse.json({ error: "Failed to build attention list" }, { status: 500 });
  }
}
