"use client";
import React, { useState, useEffect } from "react";
import UpcomingReleasesSortableList from "@/components/admin/UpcomingReleasesSortableList";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

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

export default function AdminCatalog() {
  const toast = useToast();
  const [upcomingReleases, setUpcomingReleases] = useState<UpcomingRelease[]>([]);
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
      const upcomingRes = await fetch("/api/upcoming-releases");
      if (upcomingRes.ok) {
        const data = await upcomingRes.json();
        setUpcomingReleases(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch upcoming releases");
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
    <div>
      <div>
        <PageHeader
          title="Upcoming releases"
          description="Schedule releases that aren't out yet. Artists and Releases each have their own section in the sidebar."
        />

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
