"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AdminNavbar from "@/components/local-ui/AdminNavbar";
import MusicCardSm from "@/components/local-ui/MusicCardSm";
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

interface Single {
  id: string;
  name: string;
  image?: string;
  audioFile: string;
  duration: number;
  spotifyLink?: string;
  appleMusicLink?: string;
  tidalLink?: string;
  amazonMusicLink?: string;
  youtubeLink?: string;
  soundcloudLink?: string;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
  isrcExplicit?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Album {
  id: string;
  name: string;
  coverImage: string;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames?: string[];
  releaseDate?: string;
  description?: string;
  songIds: string[];
  songs?: Single[];
  createdAt: string;
  updatedAt: string;
}

interface ArtistSummary {
  id: string;
  name: string;
}

export default function AlbumDetail() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.artistId as string;
  const albumId = params.albumId as string;
  
  const [album, setAlbum] = useState<Album | null>(null);
  const [allArtists, setAllArtists] = useState<ArtistSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSongDialogOpen, setDeleteSongDialogOpen] = useState(false);
  const [songToDelete, setSongToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchAlbumData();
  }, [artistId, albumId]);

  const fetchAlbumData = async () => {
    try {
      const response = await fetch(`/api/artists/${artistId}/albums/${albumId}`);
      if (response.ok) {
        const albumData = await response.json();
        setAlbum(albumData);
        const artistsResponse = await fetch("/api/artists");
        if (artistsResponse.ok) {
          const artistsData: ArtistSummary[] = await artistsResponse.json();
          setAllArtists(artistsData);
        }
      } else {
        if (response.status === 404) {
          setError("Album not found");
        } else {
          setError("Failed to fetch Album");
        }
      }
    } catch (error) {
      console.error("Error fetching Album:", error);
      setError("Failed to fetch Album");
    } finally {
      setIsLoading(false);
    }
  };

  const getArtistNames = (ids: string[] = []) =>
    ids
      .map((id) => allArtists.find((item) => item.id === id)?.name)
      .filter((name): name is string => Boolean(name));

  const getPrimaryArtistName = (primaryArtistIds: string[] = []) => {
    const names = getArtistNames(primaryArtistIds);
    return names.length > 0 ? names.join(", ") : "Unknown Artist";
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


  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!album) return;

    try {
      const response = await fetch(`/api/artists/${artistId}/albums/${albumId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDeleteDialogOpen(false);
        router.push(`/admin/catalog/artist/${artistId}`);
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting album:", error);
      alert("Failed to delete album");
    }
  };

  const handleDeleteSongClick = (songId: string, songName: string) => {
    setSongToDelete({ id: songId, name: songName });
    setDeleteSongDialogOpen(true);
  };

  const handleDeleteSongConfirm = async () => {
    if (!songToDelete) return;

    try {
      const response = await fetch(`/api/artists/${artistId}/singles/${songToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDeleteSongDialogOpen(false);
        setSongToDelete(null);
        // Refresh album data to update song list
        fetchAlbumData();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting song:", error);
      alert("Failed to delete song");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen  text-white">
        <AdminNavbar />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="min-h-screen  text-white">
        <AdminNavbar />
        <div className="px-[10%] py-14">
          <div className="text-center py-20">
            <p className="text-red-400 mb-4">{error || "Album not found"}</p>
            <Button onClick={() => router.back()} variant="outline" className="border-gray-700">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen  text-white">
      <AdminNavbar />
      
      <div className="px-[10%] py-14">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Artist
          </Button>
          
          <div className="flex gap-8 items-start">
            <img
              src={album.coverImage}
              alt={album.name}
              className="w-64 h-64 object-cover rounded-lg"
            />
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="text-4xl font-light tracking-tighter mb-4">{album.name}</h1>
                  {album.releaseDate && (
                    <p className="text-gray-500 mb-2">
                      {new Date(album.releaseDate).getFullYear()}
                    </p>
                  )}
                  {album.description && (
                    <p className="text-gray-400 mb-4">{album.description}</p>
                  )}
                  <p className="text-gray-500">
                    {album.songs?.length || album.songIds.length} song{album.songs?.length !== 1 || album.songIds.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-4 h-8 w-8"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-[#0F0F0F] border-gray-800">
                    <DropdownMenuItem asChild>
                      <Link href={`/admin/catalog/edit/album/${albumId}`}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit Album
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={handleDeleteClick}
                      className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Album
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

        {/* Songs Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-light tracking-tighter mb-6">Songs</h2>

          {!album.songs || album.songs.length === 0 ? (
            <div className="text-center py-20 bg-[#0F0F0F] rounded-xl">
              <p className="text-gray-400 text-lg">No songs found in this album</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {album.songs.map((song) => {
                // For admin pages, we can use the album's primary artist or leave undefined
                // Since songs don't have artist objects, we'll just not show artist name
                return (
                  <div key={song.id} className="relative group w-72 h-84">
                    <MusicCardSm
                      song={{
                        id: song.id,
                        name: song.name,
                        thumbnail: song.image,
                        audio: song.audioFile,
                        primaryArtistName: getPrimaryArtistName(song.primaryArtistIds),
                        featureArtistNames: getFeatureArtistNames(
                          song.featureArtistNames,
                          song.featureArtistIds,
                          song.primaryArtistIds
                        ),
                      spotifyLink: song.spotifyLink,
                      appleMusicLink: song.appleMusicLink,
                      tidalLink: song.tidalLink,
                      amazonMusicLink: song.amazonMusicLink,
                      youtubeLink: song.youtubeLink,
                      soundcloudLink: song.soundcloudLink,
                        isrcExplicit: song.isrcExplicit,
                      }}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 h-8 w-8"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-[#0F0F0F] border-gray-800">
                        <DropdownMenuItem asChild>
                          <Link
                            href={`/admin/catalog/edit/single/${song.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit Song
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteSongClick(song.id, song.name);
                          }}
                          className="text-red-400 focus:text-red-300 focus:bg-red-950/20"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Song
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delete Album Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Delete Album</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to delete &quot;{album?.name}&quot;? This will remove the album but keep the songs. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                className="border-gray-700"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Song Confirmation Dialog */}
        <Dialog open={deleteSongDialogOpen} onOpenChange={setDeleteSongDialogOpen}>
          <DialogContent className="bg-[#0F0F0F] border-gray-800 text-white">
            <DialogHeader>
              <DialogTitle>Delete Song</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to delete &quot;{songToDelete?.name}&quot;? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteSongDialogOpen(false);
                  setSongToDelete(null);
                }}
                className="border-gray-700"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteSongConfirm}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

