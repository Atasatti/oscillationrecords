"use client";
import React, { useEffect, useState } from "react";
import { Search, Check, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";

// Mirror of the Release model's six streaming-link fields (and lib/musicbrainz
// ReleaseLinkKey). Kept local so this component has no server-only imports.
export type ReleaseLinkKey =
  | "spotifyLink"
  | "appleMusicLink"
  | "tidalLink"
  | "amazonMusicLink"
  | "youtubeLink"
  | "soundcloudLink";

const LINK_ORDER: ReleaseLinkKey[] = [
  "spotifyLink",
  "appleMusicLink",
  "tidalLink",
  "amazonMusicLink",
  "youtubeLink",
  "soundcloudLink",
];

const LINK_LABELS: Record<ReleaseLinkKey, string> = {
  spotifyLink: "Spotify",
  appleMusicLink: "Apple Music",
  tidalLink: "Tidal",
  amazonMusicLink: "Amazon Music",
  youtubeLink: "YouTube",
  soundcloudLink: "SoundCloud",
};

type MbReleaseMatch = {
  mbid: string;
  title: string;
  artist: string | null;
  date: string | null;
  country: string | null;
  score: number | null;
};

type SpotifyAlbumMatch = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyUrl: string | null;
  releaseDate: string | null;
  artistNames: string[];
};

export interface SpotifyAlbumPick {
  name: string;
  spotifyUrl: string | null;
  coverUrl: string | null;
  releaseDate: string | null;
  artistNames: string[];
}

export interface ReleaseLinkImportProps {
  /** Release name, used to seed the search box. */
  seedName: string;
  /** Primary artist name, appended to the seed query to sharpen matches. */
  seedArtist?: string;
  /** Current link values — drives the "keep existing"/"will add" preview. */
  links: Record<ReleaseLinkKey, string>;
  /** Apply found streaming links (parent fills only-empty fields). */
  onApplyLinks: (found: Partial<Record<ReleaseLinkKey, string>>) => void;
  /** Apply a picked Spotify album (parent merges conservatively). */
  onApplySpotify: (album: SpotifyAlbumPick) => void;
}

export default function ReleaseLinkImport({
  seedName,
  seedArtist,
  links,
  onApplyLinks,
  onApplySpotify,
}: ReleaseLinkImportProps) {
  const toast = useToast();
  const seed = [seedName, seedArtist].filter(Boolean).join(" ").trim();

  // MusicBrainz release-link import (free; no config needed).
  const [mbOpen, setMbOpen] = useState(false);
  const [mbQuery, setMbQuery] = useState("");
  const [mbResults, setMbResults] = useState<MbReleaseMatch[]>([]);
  const [mbSearching, setMbSearching] = useState(false);
  const [mbResolving, setMbResolving] = useState(false);
  const [mbPreview, setMbPreview] = useState<Partial<Record<ReleaseLinkKey, string>> | null>(null);
  const [mbPickedTitle, setMbPickedTitle] = useState("");

  // Spotify album import (only when configured).
  const [spotifyEnabled, setSpotifyEnabled] = useState(false);
  const [spOpen, setSpOpen] = useState(false);
  const [spQuery, setSpQuery] = useState("");
  const [spResults, setSpResults] = useState<SpotifyAlbumMatch[]>([]);
  const [spSearching, setSpSearching] = useState(false);

  // Cheap probe to detect whether Spotify credentials are configured.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/spotify/search?type=album");
        if (!cancelled) setSpotifyEnabled(res.ok);
      } catch {
        if (!cancelled) setSpotifyEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runMbSearch = async () => {
    if (!mbQuery.trim()) return;
    setMbSearching(true);
    setMbPreview(null);
    try {
      const res = await fetch(
        `/api/admin/musicbrainz?type=release&q=${encodeURIComponent(mbQuery)}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMbResults(data.releases || []);
    } catch {
      toast.error("MusicBrainz search failed");
    } finally {
      setMbSearching(false);
    }
  };

  const pickMbRelease = async (m: MbReleaseMatch) => {
    setMbResolving(true);
    setMbPickedTitle(m.title);
    try {
      const res = await fetch(
        `/api/admin/musicbrainz?type=release&releaseMbid=${encodeURIComponent(m.mbid)}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      const found = (data.links || {}) as Partial<Record<ReleaseLinkKey, string>>;
      if (Object.keys(found).length === 0) {
        toast.success("That release has no streaming links on MusicBrainz yet — nothing to import.");
        setMbOpen(false);
        return;
      }
      setMbPreview(found);
    } catch {
      toast.error("Couldn't load links from MusicBrainz");
    } finally {
      setMbResolving(false);
    }
  };

  const applyMbLinks = () => {
    if (!mbPreview) return;
    let applied = 0;
    let skipped = 0;
    (Object.keys(mbPreview) as ReleaseLinkKey[]).forEach((k) => {
      if (links[k] && links[k].trim()) skipped++;
      else applied++;
    });
    onApplyLinks(mbPreview);
    setMbOpen(false);
    setMbPreview(null);
    toast.success(
      `Added ${applied} link${applied === 1 ? "" : "s"}${skipped ? `, kept ${skipped} existing` : ""} — review and save.`
    );
  };

  const runSpSearch = async () => {
    if (!spQuery.trim()) return;
    setSpSearching(true);
    try {
      const res = await fetch(
        `/api/admin/spotify/search?type=album&q=${encodeURIComponent(spQuery)}`
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSpResults(data.albums || []);
    } catch {
      toast.error("Spotify search failed");
    } finally {
      setSpSearching(false);
    }
  };

  const pickSpAlbum = (a: SpotifyAlbumMatch) => {
    onApplySpotify({
      name: a.name,
      spotifyUrl: a.spotifyUrl,
      coverUrl: a.imageUrl,
      releaseDate: a.releaseDate,
      artistNames: a.artistNames,
    });
    setSpOpen(false);
    toast.success(`Imported “${a.name}” from Spotify — review and save.`);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {spotifyEnabled ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSpQuery(seed);
              setSpResults([]);
              setSpOpen(true);
            }}
          >
            <Search className="h-4 w-4" /> Import from Spotify
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setMbQuery(seed);
            setMbResults([]);
            setMbPreview(null);
            setMbOpen(true);
          }}
        >
          <Link2 className="h-4 w-4" /> Import links from MusicBrainz
        </Button>
      </div>

      {/* MusicBrainz streaming-link import */}
      <Dialog open={mbOpen} onOpenChange={setMbOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader className="min-w-0">
            <DialogTitle>Import links from MusicBrainz</DialogTitle>
            <DialogDescription className="break-words">
              Find this release and import its streaming links (Spotify, Apple
              Music, Tidal, Amazon, YouTube, SoundCloud) — filling only empty
              fields. Coverage varies; review before applying.
            </DialogDescription>
          </DialogHeader>

          {mbPreview ? (
            <div className="min-w-0 space-y-3">
              <p className="text-sm text-muted-foreground">
                Found for <span className="text-foreground">{mbPickedTitle}</span>:
              </p>
              <ul className="space-y-2">
                {LINK_ORDER.filter((k) => mbPreview[k]).map((k) => {
                  const willKeep = Boolean(links[k] && links[k].trim());
                  return (
                    <li
                      key={k}
                      className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm"
                    >
                      <span className="w-24 shrink-0 font-medium">{LINK_LABELS[k]}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {mbPreview[k]}
                      </span>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                          willKeep
                            ? "bg-muted text-muted-foreground"
                            : "bg-green-500/15 text-green-400"
                        }`}
                      >
                        {willKeep ? "keep existing" : "will add"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-2 pt-1">
                <Button type="button" onClick={applyMbLinks}>
                  <Check className="h-4 w-4" /> Apply links
                </Button>
                <Button type="button" variant="outline" onClick={() => setMbPreview(null)}>
                  Back
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  value={mbQuery}
                  onChange={(e) => setMbQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      runMbSearch();
                    }
                  }}
                  placeholder="Release title (and artist)…"
                  autoFocus
                />
                <Button type="button" onClick={runMbSearch} disabled={mbSearching}>
                  {mbSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {mbResolving ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading links…
                  </p>
                ) : (
                  mbResults.map((m) => (
                    <button
                      key={m.mbid}
                      type="button"
                      onClick={() => pickMbRelease(m)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-white/[0.04]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[m.artist, m.date, m.country].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                )}
                {!mbSearching && !mbResolving && mbQuery && mbResults.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No matches — try the title plus the artist name.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Spotify album import */}
      <Dialog open={spOpen} onOpenChange={setSpOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Spotify</DialogTitle>
            <DialogDescription>
              Search for the release and pick a match to fill the Spotify link
              (and the cover, name and date if they’re still empty). You can edit
              everything before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={spQuery}
              onChange={(e) => setSpQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSpSearch();
                }
              }}
              placeholder="Release title (and artist)…"
              autoFocus
            />
            <Button type="button" onClick={runSpSearch} disabled={spSearching}>
              {spSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {spResults.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => pickSpAlbum(a)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-white/[0.04]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.imageUrl || "/placeholder.svg"}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[a.artistNames.join(", "), a.releaseDate].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {!spSearching && spQuery && spResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No matches — try the title plus the artist name.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
