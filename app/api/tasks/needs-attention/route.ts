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

      if (seo.grade === "weak") {
        items.push({
          id: `artist-seo-${a.id}`,
          type: "artist",
          title: `${a.name} — weak SEO (${seo.score}/100)`,
          detail: `Missing: ${seo.missing.slice(0, 3).join(", ")}`,
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "high",
        });
      } else if (seo.grade === "good" && seo.missing.length > 0) {
        items.push({
          id: `artist-seo-good-${a.id}`,
          type: "artist",
          title: `${a.name} — SEO could be stronger (${seo.score}/100)`,
          detail: `Quick wins: ${seo.missing.slice(0, 2).join(", ")}`,
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "medium",
        });
      }

      if (!a.musicBrainzId) {
        items.push({
          id: `artist-mb-${a.id}`,
          type: "artist",
          title: `${a.name} — missing MusicBrainz ID`,
          detail: "Links to the global music metadata graph and improves entity recognition",
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "medium",
        });
      }

      if (!a.isni) {
        items.push({
          id: `artist-isni-${a.id}`,
          type: "artist",
          title: `${a.name} — no ISNI`,
          detail: "International Standard Name Identifier — needed for rights, distribution and PRO registration",
          href: `/admin/catalog/artists/${a.id}/edit`,
          priority: "low",
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
        href: "/admin/catalog",
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

    // Deduplicate: if an artist already has a "weak SEO" item, skip the individual
    // MusicBrainz/ISNI items for that same artist (already covered in the detail)
    const weakArtistIds = new Set(
      items.filter((i) => i.id.startsWith("artist-seo-")).map((i) => i.id.replace("artist-seo-", ""))
    );
    const deduped = items.filter((item) => {
      if (item.id.startsWith("artist-mb-") && weakArtistIds.has(item.id.replace("artist-mb-", ""))) return false;
      if (item.id.startsWith("artist-isni-") && weakArtistIds.has(item.id.replace("artist-isni-", ""))) return false;
      if (item.id.startsWith("artist-email-") && weakArtistIds.has(item.id.replace("artist-email-", ""))) return false;
      return true;
    });

    // Sort: high → medium → low
    const ORDER = { high: 0, medium: 1, low: 2 };
    deduped.sort((a, b) => ORDER[a.priority] - ORDER[b.priority]);

    return NextResponse.json({ items: deduped, total: deduped.length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error building needs-attention list:", error);
    return NextResponse.json({ error: "Failed to build attention list" }, { status: 500 });
  }
}
