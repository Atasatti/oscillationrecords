import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { computeArtistSeo, computeReleaseSeo } from "@/lib/seo-score";
import { countReleasesByArtist } from "@/lib/admin-data";

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

// Canonical ISRC key: strip formatting (hyphens/spaces) and upper-case so
// "QZ-RP5-22-25582" and "QZRP52225582" compare equal. Also the value passed in the
// `?isrc=` deep-link the tracks page highlights on.
const canonIsrc = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

// GET /api/tasks/needs-attention
export async function GET(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const items: AttentionItem[] = [];

    const now = new Date();
    // "Stale" inbound = unanswered for 3+ weeks (the A&R reputation-risk threshold).
    const threeWeeksAgo = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);

    const [
      artists,
      releases,
      unhandledMessages,
      drafts,
      staleMessages,
      duePitchCount,
      duePitchesTop,
      releasedTracks,
    ] = await Promise.all([
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
      // Inbound aging + outreach follow-ups + ISRC hygiene — all from existing
      // fields, so no schema change is needed.
      prisma.contactMessage.count({ where: { handled: false, createdAt: { lte: threeWeeksAgo } } }),
      prisma.pitchLog.count({ where: { status: "sent", followUpDueAt: { lte: now } } }),
      prisma.pitchLog.findMany({
        where: { status: "sent", followUpDueAt: { lte: now } },
        select: { id: true, followUpDueAt: true, contact: { select: { name: true, outlet: true } } },
        orderBy: { followUpDueAt: "asc" },
        take: 6,
      }),
      prisma.track.findMany({
        where: { release: { status: "RELEASED" } },
        select: { id: true, name: true, isrcCode: true, releaseId: true, release: { select: { name: true } } },
      }),
    ]);

    // Release count per artist — via the SAME definition the roster/editor SEO
    // score uses (release- OR track-level, primary OR feature, any status), so an
    // artist credited only as a feature or on a single track isn't falsely
    // flagged "needs a release" here while showing 10/10 in their editor.
    const releasesByArtist = await countReleasesByArtist(artists.map((a) => a.id));

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
      } else if (!a.contactEmail) {
        // Only nudge about a missing (internal) contact email once the page is
        // otherwise in good shape — as an `else if`, so an artist never appears
        // twice (once for SEO, once for the email).
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

    // Outreach: pitch follow-ups due (status "sent" with a past follow-up date).
    // Surface the actual pitches (not just the hub count) so they're one click to
    // action. A short list shows each pitch; a long one collapses to a summary.
    if (duePitchCount > 0) {
      const overdueDays = (d: Date | null) =>
        Math.max(0, Math.floor((now.getTime() - (d ? new Date(d).getTime() : now.getTime())) / 86_400_000));
      if (duePitchCount <= 6) {
        for (const p of duePitchesTop) {
          const days = overdueDays(p.followUpDueAt);
          items.push({
            id: `pitch-followup-${p.id}`,
            type: "system",
            title: `Follow up: ${p.contact?.name ?? "pitch"}${p.contact?.outlet ? ` · ${p.contact.outlet}` : ""}`,
            detail: days === 0 ? "Follow-up is due today." : `Follow-up is ${days} day${days > 1 ? "s" : ""} overdue.`,
            href: `/admin/outreach/pitches/${p.id}/edit`,
            priority: "high",
          });
        }
      } else {
        const oldest = duePitchesTop[0];
        const days = overdueDays(oldest?.followUpDueAt ?? null);
        items.push({
          id: "pitch-followup-all",
          type: "system",
          title: `${duePitchCount} pitches awaiting follow-up`,
          detail: `Oldest is ${days} day${days > 1 ? "s" : ""} overdue${oldest?.contact?.name ? ` (${oldest.contact.name})` : ""}.`,
          href: "/admin/outreach/pitches",
          priority: "high",
        });
      }
    }

    // ISRC hygiene on live releases. A missing ISRC blocks royalty / neighbouring-
    // rights collection. A single ISRC shared by tracks with DIFFERENT names is a
    // data error — but the same recording reused across releases legitimately keeps
    // one ISRC, so we only flag a code shared by differently-named tracks.
    const isrcByCode = new Map<string, { name: string; releaseId: string; releaseName: string }[]>();
    const gapByRelease = new Map<string, { releaseName: string; count: number }>();
    for (const t of releasedTracks) {
      const code = canonIsrc(t.isrcCode ?? "");
      if (!code) {
        const g = gapByRelease.get(t.releaseId) ?? { releaseName: t.release.name, count: 0 };
        g.count += 1;
        gapByRelease.set(t.releaseId, g);
      } else {
        const arr = isrcByCode.get(code) ?? [];
        arr.push({ name: t.name, releaseId: t.releaseId, releaseName: t.release.name });
        isrcByCode.set(code, arr);
      }
    }
    let isrcGapItems = 0;
    for (const [releaseId, g] of gapByRelease) {
      if (isrcGapItems >= 8) break; // cap so a big backlog doesn't flood the list
      items.push({
        id: `isrc-gap-${releaseId}`,
        type: "release",
        title: `"${g.releaseName}" — ${g.count} track${g.count > 1 ? "s" : ""} missing an ISRC`,
        detail: "ISRCs identify each recording for royalty tracking and neighbouring-rights claims.",
        // `?isrc=none` → the tracks page highlights the tracks with no ISRC.
        href: `/admin/catalog/releases/${releaseId}/tracks?isrc=none`,
        priority: "medium",
      });
      isrcGapItems += 1;
    }
    for (const [code, arr] of isrcByCode) {
      const distinctNames = [...new Set(arr.map((a) => a.name.trim()))];
      if (arr.length > 1 && distinctNames.length > 1) {
        const releaseNames = [...new Set(arr.map((a) => a.releaseName))];
        items.push({
          id: `isrc-dup-${code}`,
          type: "release",
          // Name the actual clashing tracks so it's obvious which to fix, and deep-
          // link with `?isrc=` so the tracks page highlights + scrolls to them.
          title: `Duplicate ISRC ${code} on tracks: ${distinctNames.join(" · ")}`,
          detail:
            releaseNames.length > 1
              ? `Clashing across ${releaseNames.slice(0, 3).join(", ")}. Each distinct recording needs its own ISRC.`
              : `On "${releaseNames[0]}". Each distinct recording needs its own ISRC — give one of them a new code.`,
          href: `/admin/catalog/releases/${arr[0].releaseId}/tracks?isrc=${encodeURIComponent(code)}`,
          priority: "high",
        });
      }
    }

    // System-level
    if (unhandledMessages > 0) {
      items.push({
        id: "system-messages",
        type: "system",
        title: `${unhandledMessages} unread contact message${unhandledMessages > 1 ? "s" : ""}${
          staleMessages > 0 ? ` — ${staleMessages} unanswered 3+ weeks` : ""
        }`,
        detail:
          staleMessages > 0
            ? "Old unanswered messages / demos hurt the label's reputation — reply or triage."
            : "Messages submitted via the public Contact form",
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

    // Artists already yield at most one item each (the SEO / email branches above
    // are mutually exclusive), so only releases need de-duping here: if a release
    // is flagged "weak SEO", its individual field gaps (description / genre /
    // tracks / links) are already named in that item's detail — drop the
    // standalone duplicates so each release appears once.
    const weakReleaseIds = new Set(
      items.filter((i) => i.id.startsWith("release-seo-")).map((i) => i.id.replace("release-seo-", ""))
    );
    const RELEASE_FIELD_PREFIXES = ["release-desc-", "release-genre-", "release-tracks-", "release-links-"];
    const deduped = items.filter((item) => {
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
