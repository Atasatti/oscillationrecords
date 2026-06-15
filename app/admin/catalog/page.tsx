"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import AdminNavbar from "@/components/local-ui/AdminNavbar";
import ArtistsSortableList from "@/components/admin/ArtistsSortableList";
import CatalogReleasesSortableList from "@/components/admin/CatalogReleasesSortableList";
import UpcomingReleasesSortableList from "@/components/admin/UpcomingReleasesSortableList";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  Plus,
  Users,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  Disc3,
  Layers,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/local-ui/Toast";

interface Artist {
  id: string;
  name: string;
  biography: string;
  profilePicture?: string;
  xLink?: string;
  tiktokLink?: string;
  spotifyLink?: string;
  instagramLink?: string;
  youtubeLink?: string;
  facebookLink?: string;
  createdAt: string;
  updatedAt: string;
  sortOrder?: number;
  showOnWebsite?: boolean;
}

interface CatalogRelease {
  id: string;
  name: string;
  thumbnail?: string | null;
  audio?: string | null;
  type: "single" | "ep" | "album";
  primaryArtistName?: string;
  featureArtistNames?: string[];
  artist: string;
  songCount: number;
  spotifyLink?: string | null;
  appleMusicLink?: string | null;
  tidalLink?: string | null;
  amazonMusicLink?: string | null;
  youtubeLink?: string | null;
  soundcloudLink?: string | null;
  isrcExplicit?: boolean;
  sortOrder?: number;
  showLatestOnHome?: boolean;
  showOnHome?: boolean;
}

interface UpcomingRelease {
  id: string;
  name: string;
  type: "single" | "ep" | "album";
  image: string;
  releaseDate: string;
  sortOrder?: number;
  preSmartLinkUrl?: string | null;
  primaryArtist?: string | null;
  featureArtist?: string | null;
  createdAt: string;
  updatedAt: string;
}

function NewReleaseDropdown({
  align = "end",
  className,
}: {
  align?: "start" | "center" | "end";
  className?: string;
}) {
  const itemClass =
    "flex w-full cursor-pointer items-start gap-3 rounded-sm px-2 py-2.5 text-left outline-none";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          className={cn(
            "gap-2 bg-white text-black shadow-sm hover:bg-gray-200 sm:min-w-[11rem]",
            "w-full justify-center sm:w-auto",
            className
          )}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <span>New release</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="w-[min(100vw-2rem,20rem)] border-white/10 bg-[#141414] p-1 text-gray-100 shadow-xl"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-gray-500">
          Choose a release type
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-800" />
        <DropdownMenuItem asChild className="p-0 focus:bg-white/10">
          <Link href="/admin/catalog/create/single" className={itemClass}>
            <Disc3 className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-white">Single</span>
              <span className="text-xs leading-snug text-gray-500">
                One main track — typical for a single drop
              </span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-0 focus:bg-white/10">
          <Link href="/admin/catalog/create/ep" className={itemClass}>
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-amber-500/90" aria-hidden />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-white">EP</span>
              <span className="text-xs leading-snug text-gray-500">
                A short multi-track release
              </span>
            </span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="p-0 focus:bg-white/10">
          <Link href="/admin/catalog/create/album" className={itemClass}>
            <Library className="mt-0.5 h-4 w-4 shrink-0 text-sky-400/90" aria-hidden />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium text-white">Album</span>
              <span className="text-xs leading-snug text-gray-500">
                Full-length release with multiple tracks
              </span>
            </span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AdminCatalog() {
  const toast = useToast();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [releases, setReleases] = useState<CatalogRelease[]>([]);
  const [upcomingReleases, setUpcomingReleases] = useState<UpcomingRelease[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [artistToDelete, setArtistToDelete] = useState<{ id: string; name: string } | null>(null);
  const [contentDeleteDialogOpen, setContentDeleteDialogOpen] = useState(false);
  const [contentToDelete, setContentToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [upcomingDeleteOpen, setUpcomingDeleteOpen] = useState(false);
  const [upcomingToDelete, setUpcomingToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [upcomingForm, setUpcomingForm] = useState({
    name: "",
    type: "single" as "single" | "ep" | "album",
    releaseDate: "",
    preSmartLinkUrl: "",
    primaryArtist: "",
    featureArtist: "",
    imageFile: null as File | null,
  });
  const [upcomingImagePreview, setUpcomingImagePreview] = useState<string | null>(null);
  const [isCreatingUpcoming, setIsCreatingUpcoming] = useState(false);
  const [isUploadingUpcomingImage, setIsUploadingUpcomingImage] = useState(false);
  const [upcomingEditOpen, setUpcomingEditOpen] = useState(false);
  const [upcomingEditingId, setUpcomingEditingId] = useState<string | null>(null);
  const [upcomingEditForm, setUpcomingEditForm] = useState({
    name: "",
    type: "single" as "single" | "ep" | "album",
    releaseDate: "",
    preSmartLinkUrl: "",
    primaryArtist: "",
    featureArtist: "",
    imageFile: null as File | null,
    existingImageUrl: "",
  });
  const [upcomingEditImagePreview, setUpcomingEditImagePreview] = useState<string | null>(null);
  const [isSavingUpcomingEdit, setIsSavingUpcomingEdit] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [artistsRes, releasesRes, upcomingRes] = await Promise.all([
        fetch("/api/artists"),
        fetch("/api/releases"),
        fetch("/api/upcoming-releases"),
      ]);

      if (artistsRes.ok) {
        const data = await artistsRes.json();
        setArtists(data);
      }

      if (releasesRes.ok) {
        const data = await releasesRes.json();
        setReleases(data);
      }

      if (upcomingRes.ok) {
        const data = await upcomingRes.json();
        setUpcomingReleases(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      setError("Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArtists = async () => {
    try {
      const response = await fetch("/api/artists");
      if (response.ok) {
        const data = await response.json();
        setArtists(data);
      } else {
        setError("Failed to fetch artists");
      }
    } catch (error) {
      console.error("Error fetching artists:", error);
      setError("Failed to fetch artists");
    }
  };

  const handleDeleteClick = (artistId: string, artistName: string) => {
    setArtistToDelete({ id: artistId, name: artistName });
    setDeleteDialogOpen(true);
  };

  const handleArtistsReorderSave = async (ordered: Artist[]) => {
    try {
      const res = await fetch("/api/admin/artists/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((a) => a.id) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err.error === "string" ? err.error : "Failed to save artist order";
        toast.error(msg);
        throw new Error(msg);
      }
      setArtists(ordered);
    } catch (e) {
      if (e instanceof TypeError) {
        toast.error("Network error - could not save artist order.");
      }
      throw e;
    }
  };

  const handleArtistShowOnWebsiteChange = async (id: string, checked: boolean) => {
    const prev = [...artists];
    setArtists((list) =>
      list.map((x) => (x.id === id ? { ...x, showOnWebsite: checked } : x))
    );
    try {
      const res = await fetch(`/api/artists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnWebsite: checked }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string"
            ? err.error
            : "Failed to update artist visibility"
        );
        setArtists(prev);
      }
    } catch {
      setArtists(prev);
      toast.error("Failed to update artist visibility");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!artistToDelete) return;

    try {
      const response = await fetch(`/api/artists/${artistToDelete.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDeleteDialogOpen(false);
        setArtistToDelete(null);
        fetchAllData();
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting artist:", error);
      toast.error("Failed to delete artist");
    }
  };

  const handleContentDeleteClick = (id: string, name: string) => {
    setContentToDelete({ id, name });
    setContentDeleteDialogOpen(true);
  };

  const handleContentDeleteConfirm = async () => {
    if (!contentToDelete) return;

    try {
      const response = await fetch(`/api/releases/${contentToDelete.id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setContentDeleteDialogOpen(false);
        setContentToDelete(null);
        fetchAllData();
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error deleting release:", error);
      toast.error("Failed to delete release");
    }
  };

  const getUpcomingPresignedUrl = async (imageFile: File) => {
    const timestamp = Date.now();
    const imageFileName = `upcoming-releases/images/${timestamp}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageFileName,
        imageFileType: imageFile.type,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to get image upload URL");
    }
    return response.json() as Promise<{ uploadURL: string; fileURL: string }>;
  };

  const handleUpcomingImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpcomingForm((prev) => ({ ...prev, imageFile: file }));
    setUpcomingImagePreview(URL.createObjectURL(file));
  };

  const openUpcomingEdit = (release: UpcomingRelease) => {
    setUpcomingEditingId(release.id);
    const d = new Date(release.releaseDate);
    const releaseDateStr = Number.isNaN(d.getTime())
      ? ""
      : d.toISOString().slice(0, 10);
    setUpcomingEditForm({
      name: release.name,
      type: release.type,
      releaseDate: releaseDateStr,
      preSmartLinkUrl: release.preSmartLinkUrl ?? "",
      primaryArtist: release.primaryArtist ?? "",
      featureArtist: release.featureArtist ?? "",
      imageFile: null,
      existingImageUrl: release.image,
    });
    setUpcomingEditImagePreview(release.image);
    setUpcomingEditOpen(true);
  };

  const handleUpcomingEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUpcomingEditForm((prev) => ({ ...prev, imageFile: file }));
    setUpcomingEditImagePreview(URL.createObjectURL(file));
  };

  const handleSaveUpcomingEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upcomingEditingId) return;
    if (!upcomingEditForm.name.trim() || !upcomingEditForm.releaseDate) {
      toast.error("Name and release date are required");
      return;
    }

    setIsSavingUpcomingEdit(true);
    try {
      let imageUrl = upcomingEditForm.existingImageUrl;
      if (upcomingEditForm.imageFile) {
        setIsUploadingUpcomingImage(true);
        const presigned = await getUpcomingPresignedUrl(upcomingEditForm.imageFile);
        const uploadRes = await fetch(presigned.uploadURL, {
          method: "PUT",
          body: upcomingEditForm.imageFile,
          headers: { "Content-Type": upcomingEditForm.imageFile.type },
        });
        if (!uploadRes.ok) throw new Error("Failed to upload image");
        imageUrl = presigned.fileURL;
        setIsUploadingUpcomingImage(false);
      }

      const patchRes = await fetch(`/api/upcoming-releases/${upcomingEditingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: upcomingEditForm.name.trim(),
          type: upcomingEditForm.type,
          image: imageUrl,
          releaseDate: upcomingEditForm.releaseDate,
          preSmartLinkUrl: upcomingEditForm.preSmartLinkUrl.trim() || null,
          primaryArtist: upcomingEditForm.primaryArtist.trim() || null,
          featureArtist: upcomingEditForm.featureArtist.trim() || null,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json();
        throw new Error(err.error || "Failed to update upcoming release");
      }

      setUpcomingEditOpen(false);
      setUpcomingEditingId(null);
      fetchAllData();
    } catch (error) {
      console.error("Error updating upcoming release:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update upcoming release");
    } finally {
      setIsUploadingUpcomingImage(false);
      setIsSavingUpcomingEdit(false);
    }
  };

  const handleCreateUpcomingRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upcomingForm.name || !upcomingForm.releaseDate || !upcomingForm.imageFile) {
      toast.error("Please fill all fields and choose an image");
      return;
    }

    setIsCreatingUpcoming(true);
    try {
      setIsUploadingUpcomingImage(true);
      const presigned = await getUpcomingPresignedUrl(upcomingForm.imageFile);
      const uploadRes = await fetch(presigned.uploadURL, {
        method: "PUT",
        body: upcomingForm.imageFile,
        headers: { "Content-Type": upcomingForm.imageFile.type },
      });
      if (!uploadRes.ok) throw new Error("Failed to upload image");
      setIsUploadingUpcomingImage(false);

      const createRes = await fetch("/api/upcoming-releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: upcomingForm.name,
          type: upcomingForm.type,
          image: presigned.fileURL,
          releaseDate: upcomingForm.releaseDate,
          preSmartLinkUrl: upcomingForm.preSmartLinkUrl.trim() || undefined,
          primaryArtist: upcomingForm.primaryArtist.trim() || undefined,
          featureArtist: upcomingForm.featureArtist.trim() || undefined,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "Failed to create upcoming release");
      }

      setUpcomingForm({
        name: "",
        type: "single",
        releaseDate: "",
        preSmartLinkUrl: "",
        primaryArtist: "",
        featureArtist: "",
        imageFile: null,
      });
      setUpcomingImagePreview(null);
      fetchAllData();
    } catch (error) {
      console.error("Error creating upcoming release:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create upcoming release");
    } finally {
      setIsUploadingUpcomingImage(false);
      setIsCreatingUpcoming(false);
    }
  };

  const handleDeleteUpcomingClick = (releaseId: string) => {
    const r = upcomingReleases.find((x) => x.id === releaseId);
    setUpcomingToDelete({ id: releaseId, name: r?.name ?? "this release" });
    setUpcomingDeleteOpen(true);
  };

  const handleDeleteUpcomingConfirm = async () => {
    if (!upcomingToDelete) return;
    try {
      const response = await fetch(`/api/upcoming-releases/${upcomingToDelete.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to delete upcoming release");
      }
      setUpcomingDeleteOpen(false);
      setUpcomingToDelete(null);
      fetchAllData();
    } catch (error) {
      console.error("Error deleting upcoming release:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete upcoming release");
    }
  };

  const handleCatalogReorderSave = async (
    ordered: CatalogRelease[]
  ) => {
    try {
      const res = await fetch("/api/admin/releases/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((r) => r.id) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err.error === "string" ? err.error : "Failed to save order";
        toast.error(msg);
        throw new Error(msg);
      }
      setReleases(ordered);
    } catch (e) {
      if (e instanceof TypeError) {
        toast.error("Network error — could not save order.");
      }
      throw e;
    }
  };

  const handleReleaseLatestChange = async (id: string, checked: boolean) => {
    const prev = [...releases];
    setReleases((list) =>
      list.map((x) =>
        x.id === id ? { ...x, showLatestOnHome: checked } : x
      )
    );
    try {
      const res = await fetch(`/api/releases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showLatestOnHome: checked }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string"
            ? err.error
            : "Failed to update Latest flag"
        );
        setReleases(prev);
      }
    } catch {
      setReleases(prev);
      toast.error("Failed to update Latest flag");
    }
  };

  const handleReleaseShowOnHomeChange = async (id: string, checked: boolean) => {
    const prev = [...releases];
    setReleases((list) =>
      list.map((x) => (x.id === id ? { ...x, showOnHome: checked } : x))
    );
    try {
      const res = await fetch(`/api/releases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnHome: checked }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(
          typeof err.error === "string"
            ? err.error
            : "Failed to update New Music carousel"
        );
        setReleases(prev);
      }
    } catch {
      setReleases(prev);
      toast.error("Failed to update New Music carousel");
    }
  };

  const handleUpcomingReorderSave = async (ordered: UpcomingRelease[]) => {
    try {
      const res = await fetch("/api/admin/upcoming-releases/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((r) => r.id) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg =
          typeof err.error === "string" ? err.error : "Failed to save order";
        toast.error(msg);
        throw new Error(msg);
      }
      setUpcomingReleases(ordered);
    } catch (e) {
      if (e instanceof TypeError) {
        toast.error("Network error — could not save order.");
      }
      throw e;
    }
  };

  return (
    <div className="min-h-screen text-white">
      <AdminNavbar />
      
      <div className="px-4 md:px-6 lg:px-[10%] py-8 md:py-12 lg:py-14">
        {/* Header */}
        <div className="mb-8 md:mb-12 lg:mb-14">
          <p className="text-xs uppercase tracking-wider text-center text-muted-foreground">
            Music Catalog
          </p>
          <p className="font-light text-3xl md:text-4xl lg:text-5xl text-center tracking-tighter mt-2 md:mt-3">Manage Artists</p>
        </div>

        {/* Create Artist Button */}
        <div className="mb-6 md:mb-8 flex justify-center">
          <Link href="/admin/catalog/create">
            <Button className="bg-white text-black hover:bg-gray-200 px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base">
              <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" />
              Create New Artist
            </Button>
          </Link>
        </div>

        {/* Artists Section */}
        <div className="mb-12 md:mb-16">
          <div className="mb-4 md:mb-6 space-y-1">
            <h2 className="text-xl md:text-2xl font-light tracking-tighter">Artists</h2>
            <p className="max-w-xl text-sm text-gray-500">
              Drag to set the public order.{" "}
              <span className="text-gray-400">Show on website</span> controls whether an
              artist appears on the public site (home page carousel and Artists page).
            </p>
          </div>
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-400 mb-4">{error}</p>
              <Button onClick={fetchArtists} variant="outline" className="border-white/10">
                Try Again
              </Button>
            </div>
          ) : artists.length === 0 ? (
            <div className="text-center py-20 bg-[#141414] rounded-xl">
              <Users className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg mb-4">No artists found</p>
              <p className="text-gray-500 mb-6">Create your first artist to get started</p>
            </div>
          ) : (
            <ArtistsSortableList
              artists={artists}
              onReorderSave={handleArtistsReorderSave}
              onShowOnWebsiteChange={handleArtistShowOnWebsiteChange}
              onDeleteClick={handleDeleteClick}
            />
          )}
        </div>

        {/* Releases */}
        <div className="mb-12 md:mb-16">
          <div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-light tracking-tighter md:text-2xl">
                Releases
              </h2>
              <p className="max-w-xl text-sm text-gray-500">
                Drag to set one global order across Singles, EPs, and Albums.{" "}
                <span className="text-gray-400">Latest on home</span> shows the red pill;{" "}
                <span className="text-gray-400">New Music carousel</span> pins a release to the front of the home &amp; releases carousel; the remaining slots auto-fill with the newest releases.
              </p>
            </div>
            <NewReleaseDropdown />
          </div>
          {releases.length === 0 ? (
            <p className="text-sm text-gray-500">No releases yet.</p>
          ) : (
            <CatalogReleasesSortableList
              releases={releases}
              onReorderSave={handleCatalogReorderSave}
              onLatestChange={handleReleaseLatestChange}
              onShowOnHomeChange={handleReleaseShowOnHomeChange}
              onDeleteClick={handleContentDeleteClick}
            />
          )}
        </div>

        {/* Upcoming Releases Section */}
        <div className="mb-12 md:mb-16">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 md:mb-6">
            <h2 className="text-xl md:text-2xl font-light tracking-tighter">Upcoming Releases</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form
              onSubmit={handleCreateUpcomingRelease}
              className="bg-[#141414] border border-white/10 rounded-xl p-5 space-y-4"
            >
              <h3 className="text-lg">Add Upcoming Release</h3>
              <input
                type="file"
                accept="image/*"
                onChange={handleUpcomingImageChange}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-white file:text-black hover:file:bg-gray-200"
                required
              />
              {upcomingImagePreview ? (
                <img src={upcomingImagePreview} alt="Upcoming preview" className="w-24 h-24 rounded-md object-cover border border-white/10" />
              ) : null}
              <input
                value={upcomingForm.name}
                onChange={(e) => setUpcomingForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Release name"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
                required
              />
              <select
                value={upcomingForm.type}
                onChange={(e) =>
                  setUpcomingForm((prev) => ({
                    ...prev,
                    type: e.target.value as "single" | "ep" | "album",
                  }))
                }
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
              <input
                type="date"
                value={upcomingForm.releaseDate}
                onChange={(e) => setUpcomingForm((prev) => ({ ...prev, releaseDate: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
                required
              />
              <input
                value={upcomingForm.preSmartLinkUrl}
                onChange={(e) =>
                  setUpcomingForm((prev) => ({ ...prev, preSmartLinkUrl: e.target.value }))
                }
                placeholder="Pre-smart link URL (e.g. https://ditto.fm/...)"
                type="url"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              />
              <input
                value={upcomingForm.primaryArtist}
                onChange={(e) =>
                  setUpcomingForm((prev) => ({ ...prev, primaryArtist: e.target.value }))
                }
                placeholder="Primary artist"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              />
              <input
                value={upcomingForm.featureArtist}
                onChange={(e) =>
                  setUpcomingForm((prev) => ({ ...prev, featureArtist: e.target.value }))
                }
                placeholder="Featured artist (optional)"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              />
              <Button type="submit" className="bg-white text-black hover:bg-gray-200" disabled={isCreatingUpcoming}>
                {isCreatingUpcoming ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {isUploadingUpcomingImage ? "Uploading..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4 mr-2" />
                    Add Upcoming Release
                  </>
                )}
              </Button>
            </form>

            <div className="bg-[#141414] border border-white/10 rounded-xl p-5">
              <h3 className="text-lg mb-1">Scheduled</h3>
              <p className="text-xs text-gray-500 mb-4">
                Drag the grip to set the order shown on the public home page. Order
                saves automatically.
              </p>
              {upcomingReleases.length === 0 ? (
                <p className="text-gray-400">No upcoming releases scheduled.</p>
              ) : (
                <UpcomingReleasesSortableList
                  releases={upcomingReleases}
                  onReorderSave={handleUpcomingReorderSave}
                  onEdit={openUpcomingEdit}
                  onDelete={handleDeleteUpcomingClick}
                />
              )}
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="bg-[#141414] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Delete Artist</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to delete &quot;{artistToDelete?.name}&quot;? This will also delete all their singles, albums, and EPs. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setArtistToDelete(null);
                }}
                className="border-white/10"
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

        <Dialog
          open={upcomingEditOpen}
          onOpenChange={(open) => {
            setUpcomingEditOpen(open);
            if (!open) {
              setUpcomingEditingId(null);
            }
          }}
        >
          <DialogContent className="bg-[#141414] border-white/10 text-white max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit upcoming release</DialogTitle>
              <DialogDescription className="text-gray-400">
                Update cover art, pre-smart link, artists, and release details.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveUpcomingEdit} className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Cover image — leave unchanged or pick a new file</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUpcomingEditImageChange}
                  className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-white file:text-black hover:file:bg-gray-200"
                />
                {upcomingEditImagePreview ? (
                  <img
                    src={upcomingEditImagePreview}
                    alt="Preview"
                    className="w-24 h-24 rounded-md object-cover border border-white/10 mt-2"
                  />
                ) : null}
              </div>
              <input
                value={upcomingEditForm.name}
                onChange={(e) => setUpcomingEditForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Release name"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
                required
              />
              <select
                value={upcomingEditForm.type}
                onChange={(e) =>
                  setUpcomingEditForm((prev) => ({
                    ...prev,
                    type: e.target.value as "single" | "ep" | "album",
                  }))
                }
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              >
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
              <input
                type="date"
                value={upcomingEditForm.releaseDate}
                onChange={(e) =>
                  setUpcomingEditForm((prev) => ({ ...prev, releaseDate: e.target.value }))
                }
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
                required
              />
              <input
                value={upcomingEditForm.preSmartLinkUrl}
                onChange={(e) =>
                  setUpcomingEditForm((prev) => ({ ...prev, preSmartLinkUrl: e.target.value }))
                }
                placeholder="Pre-smart link URL (e.g. https://ditto.fm/...)"
                type="url"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              />
              <input
                value={upcomingEditForm.primaryArtist}
                onChange={(e) =>
                  setUpcomingEditForm((prev) => ({ ...prev, primaryArtist: e.target.value }))
                }
                placeholder="Primary artist"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              />
              <input
                value={upcomingEditForm.featureArtist}
                onChange={(e) =>
                  setUpcomingEditForm((prev) => ({ ...prev, featureArtist: e.target.value }))
                }
                placeholder="Featured artist (optional)"
                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-white"
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/10"
                  onClick={() => setUpcomingEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" className="bg-white text-black hover:bg-gray-200" disabled={isSavingUpcomingEdit}>
                  {isSavingUpcomingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isUploadingUpcomingImage ? "Uploading..." : "Saving..."}
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={contentDeleteDialogOpen} onOpenChange={setContentDeleteDialogOpen}>
          <DialogContent className="bg-[#141414] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Delete release</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to delete &quot;{contentToDelete?.name}&quot;?
                This removes the release and all of its tracks. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setContentDeleteDialogOpen(false);
                  setContentToDelete(null);
                }}
                className="border-white/10"
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleContentDeleteConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={upcomingDeleteOpen} onOpenChange={setUpcomingDeleteOpen}>
          <DialogContent className="bg-[#141414] border-white/10 text-white">
            <DialogHeader>
              <DialogTitle>Delete upcoming release</DialogTitle>
              <DialogDescription className="text-gray-400">
                Are you sure you want to delete &quot;{upcomingToDelete?.name}&quot;?
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setUpcomingDeleteOpen(false);
                  setUpcomingToDelete(null);
                }}
                className="border-white/10"
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteUpcomingConfirm}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
