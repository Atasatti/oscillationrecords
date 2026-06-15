"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminNavbar from "@/components/local-ui/AdminNavbar";
import ReleaseCardSm from "@/components/local-ui/ReleaseCardSm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, MoreVertical, Trash2, Pencil } from "lucide-react";
import {
  buildArtistMap,
  combinedFeatureDisplayNames,
} from "@/lib/release-format";
import { useToast } from "@/components/local-ui/Toast";

interface Artist {
  id: string;
  name: string;
  biography: string;
  profilePicture?: string;
  createdAt: string;
  updatedAt: string;
}

interface ArtistSummary {
  id: string;
  name: string;
}

interface ReleaseRow {
  id: string;
  name: string;
  kind: "SINGLE" | "EP" | "ALBUM";
  coverImage: string;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
  tracks: { id: string }[];
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
}

export default function AdminArtistDetail() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const artistId = params.artistId as string;

  const [artist, setArtist] = useState<Artist | null>(null);
  const [allArtists, setAllArtists] = useState<ArtistSummary[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(
    null
  );

  useEffect(() => {
    (async () => {
      try {
        const ar = await fetch(`/api/artists/${artistId}`);
        if (!ar.ok) {
          setError(ar.status === 404 ? "Artist not found" : "Failed to load");
          return;
        }
        setArtist(await ar.json());

        const [relRes, allRes] = await Promise.all([
          fetch(`/api/artists/${artistId}/releases`),
          fetch("/api/artists"),
        ]);
        if (allRes.ok) setAllArtists(await allRes.json());
        if (relRes.ok) setReleases(await relRes.json());
      } catch (e) {
        console.error(e);
        setError("Failed to load");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [artistId]);

  const getArtistNames = (ids: string[] = []) =>
    ids
      .map((id) => allArtists.find((a) => a.id === id)?.name)
      .filter((n): n is string => Boolean(n));

  const getPrimaryArtistName = (primaryArtistIds: string[] = []) => {
    const names = getArtistNames(primaryArtistIds);
    return names.length ? names.join(", ") : artist?.name || "Unknown Artist";
  };

  const getFeatureArtistNames = (
    featureArtistNames: string[] | undefined,
    featureArtistIds: string[] = [],
    primaryArtistIds: string[] = []
  ) => {
    const map = buildArtistMap(allArtists);
    return combinedFeatureDisplayNames(
      featureArtistIds,
      primaryArtistIds,
      map,
      featureArtistNames
    );
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    try {
      const res = await fetch(`/api/releases/${toDelete.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDeleteOpen(false);
        setToDelete(null);
        setReleases((prev) => prev.filter((r) => r.id !== toDelete.id));
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed");
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen text-white">
        <AdminNavbar />
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white" />
        </div>
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="min-h-screen text-white">
        <AdminNavbar />
        <div className="px-[10%] py-14 text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="outline" className="border-gray-700" onClick={() => router.back()}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AdminNavbar />
      <div className="px-[10%] py-14">
        <Button
          variant="ghost"
          onClick={() => router.push("/admin/catalog")}
          className="mb-6 text-gray-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Catalog
        </Button>

        <div className="flex flex-col md:flex-row gap-8 mb-12">
          {artist.profilePicture ? (
            <img
              src={artist.profilePicture}
              alt={artist.name}
              className="w-48 h-48 rounded-2xl object-cover"
            />
          ) : null}
          <div>
            <h1 className="text-4xl font-light tracking-tighter mb-2">{artist.name}</h1>
            <p className="text-gray-400 max-w-3xl mb-4">{artist.biography}</p>
            <Link href={`/admin/catalog/edit/artist/${artistId}`}>
              <Button variant="outline" size="sm" className="border-gray-700">
                <Pencil className="w-4 h-4 mr-2" />
                Edit artist
              </Button>
            </Link>
          </div>
        </div>

        <h2 className="text-2xl font-light mb-6">Releases</h2>
        {releases.length === 0 ? (
          <p className="text-gray-500">No releases for this artist yet.</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {releases.map((rel) => {
              const kindLabel =
                rel.kind === "ALBUM" ? "Album" : rel.kind === "EP" ? "EP" : "Single";
              return (
                <div key={rel.id} className="relative group w-72 h-84">
                  <Link href={`/admin/catalog/release/${rel.id}`}>
                    <ReleaseCardSm
                      release={{
                        id: rel.id,
                        name: rel.name,
                        thumbnail: rel.coverImage,
                        audio: null,
                        primaryArtistName: getPrimaryArtistName(rel.primaryArtistIds),
                        featureArtistNames: getFeatureArtistNames(
                          rel.featureArtistNames,
                          rel.featureArtistIds,
                          rel.primaryArtistIds
                        ),
                        songCount: rel.tracks?.length ?? 0,
                        kindLabel,
                        spotifyLink: rel.spotifyLink,
                        appleMusicLink: rel.appleMusicLink,
                        tidalLink: rel.tidalLink,
                        amazonMusicLink: rel.amazonMusicLink,
                        youtubeLink: rel.youtubeLink,
                        soundcloudLink: rel.soundcloudLink,
                        isrcExplicit: rel.isrcExplicit,
                      }}
                    />
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 z-10 h-8 w-8"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-[#0F0F0F] border-gray-800">
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/catalog/edit/release/${rel.id}`}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        className="text-red-400"
                        onClick={(e) => {
                          e.preventDefault();
                          setToDelete({ id: rel.id, name: rel.name });
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Delete release</DialogTitle>
              <DialogDescription className="text-gray-400">
                Delete &quot;{toDelete?.name}&quot; and all tracks?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="border-gray-700" onClick={() => setDeleteOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
