"use client";
import React, { useState, useEffect, useMemo } from "react";
import UpcomingReleasesSortableList from "@/components/admin/UpcomingReleasesSortableList";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
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

interface Artist {
  id: string;
  name: string;
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
  primaryArtistIds?: string[];
  featureArtistIds?: string[];
  featureArtistNames?: string[];
  createdAt: string;
  updatedAt: string;
}

type FormShape = {
  name: string;
  type: "single" | "ep" | "album";
  releaseDate: string;
  preSmartLinkUrl: string;
  primaryArtistIds: string[];
  featureArtistIds: string[];
  featureArtistNames: string; // comma-separated text in the UI
};

const emptyForm: FormShape = {
  name: "",
  type: "single",
  releaseDate: "",
  preSmartLinkUrl: "",
  primaryArtistIds: [],
  featureArtistIds: [],
  featureArtistNames: "",
};

export default function AdminCatalog() {
  const toast = useToast();
  const [upcomingReleases, setUpcomingReleases] = useState<UpcomingRelease[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);

  const [upcomingDeleteOpen, setUpcomingDeleteOpen] = useState(false);
  const [upcomingToDelete, setUpcomingToDelete] = useState<{ id: string; name: string } | null>(null);

  const [form, setForm] = useState<FormShape>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormShape>(emptyForm);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editExistingImage, setEditExistingImage] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const artistOptions = useMemo(
    () => artists.map((a) => ({ value: a.id, label: a.name })),
    [artists]
  );
  const nameById = useMemo(() => new Map(artists.map((a) => [a.id, a.name])), [artists]);

  // Resolve a row's linked artists → display strings, falling back to legacy text.
  const displayFor = (r: UpcomingRelease) => {
    const primary =
      (r.primaryArtistIds ?? []).map((id) => nameById.get(id)).filter(Boolean).join(", ") ||
      r.primaryArtist ||
      null;
    const feature =
      [
        ...(r.featureArtistIds ?? []).map((id) => nameById.get(id)).filter(Boolean),
        ...(r.featureArtistNames ?? []),
      ].join(", ") ||
      r.featureArtist ||
      null;
    return { primaryArtist: primary, featureArtist: feature };
  };

  const listRows = useMemo(
    () => upcomingReleases.map((r) => ({ ...r, ...displayFor(r) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [upcomingReleases, nameById]
  );

  useEffect(() => {
    fetchUpcoming();
    fetchArtists();
  }, []);

  const fetchUpcoming = async () => {
    try {
      const res = await fetch("/api/upcoming-releases");
      if (res.ok) setUpcomingReleases(await res.json());
    } catch (error) {
      console.error("Error fetching upcoming releases:", error);
      toast.error("Failed to fetch upcoming releases");
    }
  };

  const fetchArtists = async () => {
    try {
      const res = await fetch("/api/artists");
      if (res.ok) setArtists(await res.json());
    } catch (error) {
      console.error("Error fetching artists:", error);
    }
  };

  const getPresignedUrl = async (file: File) => {
    const timestamp = Date.now();
    const imageFileName = `upcoming-releases/images/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageFileName, imageFileType: file.type }),
    });
    if (!response.ok) throw new Error("Failed to get image upload URL");
    return response.json() as Promise<{ uploadURL: string; fileURL: string }>;
  };

  const uploadImage = async (file: File): Promise<string> => {
    const presigned = await getPresignedUrl(file);
    const uploadRes = await fetch(presigned.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!uploadRes.ok) throw new Error("Failed to upload image");
    return presigned.fileURL;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.releaseDate || !imageFile) {
      toast.error("Please add a name, release date, and cover image.");
      return;
    }
    setIsCreating(true);
    try {
      setIsUploading(true);
      const image = await uploadImage(imageFile);
      setIsUploading(false);

      const res = await fetch("/api/upcoming-releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          image,
          releaseDate: form.releaseDate,
          preSmartLinkUrl: form.preSmartLinkUrl.trim() || undefined,
          primaryArtistIds: form.primaryArtistIds,
          featureArtistIds: form.featureArtistIds,
          featureArtistNames: form.featureArtistNames,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create upcoming release");
      }
      setForm(emptyForm);
      setImageFile(null);
      setImagePreview(null);
      fetchUpcoming();
    } catch (error) {
      console.error("Error creating upcoming release:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create upcoming release");
    } finally {
      setIsUploading(false);
      setIsCreating(false);
    }
  };

  const openEdit = (release: UpcomingRelease) => {
    setEditingId(release.id);
    const d = new Date(release.releaseDate);
    setEditForm({
      name: release.name,
      type: release.type,
      releaseDate: Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10),
      preSmartLinkUrl: release.preSmartLinkUrl ?? "",
      primaryArtistIds: release.primaryArtistIds ?? [],
      featureArtistIds: release.featureArtistIds ?? [],
      featureArtistNames: (release.featureArtistNames ?? []).join(", ") || release.featureArtist || "",
    });
    setEditExistingImage(release.image);
    setEditImageFile(null);
    setEditImagePreview(release.image);
    setEditOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    if (!editForm.name.trim() || !editForm.releaseDate) {
      toast.error("Name and release date are required.");
      return;
    }
    setIsSavingEdit(true);
    try {
      let image = editExistingImage;
      if (editImageFile) {
        setIsUploading(true);
        image = await uploadImage(editImageFile);
        setIsUploading(false);
      }
      const res = await fetch(`/api/upcoming-releases/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          type: editForm.type,
          image,
          releaseDate: editForm.releaseDate,
          preSmartLinkUrl: editForm.preSmartLinkUrl.trim() || null,
          primaryArtistIds: editForm.primaryArtistIds,
          featureArtistIds: editForm.featureArtistIds,
          featureArtistNames: editForm.featureArtistNames,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update upcoming release");
      }
      setEditOpen(false);
      setEditingId(null);
      fetchUpcoming();
    } catch (error) {
      console.error("Error updating upcoming release:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update upcoming release");
    } finally {
      setIsUploading(false);
      setIsSavingEdit(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!upcomingToDelete) return;
    try {
      const res = await fetch(`/api/upcoming-releases/${upcomingToDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete upcoming release");
      }
      setUpcomingDeleteOpen(false);
      setUpcomingToDelete(null);
      fetchUpcoming();
    } catch (error) {
      console.error("Error deleting upcoming release:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete upcoming release");
    }
  };

  const handleReorderSave = async (ordered: UpcomingRelease[]) => {
    try {
      const res = await fetch("/api/admin/upcoming-releases/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: ordered.map((r) => r.id) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = typeof err.error === "string" ? err.error : "Failed to save order";
        toast.error(msg);
        throw new Error(msg);
      }
      // Persist the new order locally (keep the full rows, not the display-mapped ones).
      const byId = new Map(upcomingReleases.map((r) => [r.id, r]));
      setUpcomingReleases(ordered.map((r) => byId.get(r.id)!).filter(Boolean));
    } catch (e) {
      if (e instanceof TypeError) toast.error("Network error — could not save order.");
      throw e;
    }
  };

  // Shared artist-picker block for create + edit forms.
  const artistPicker = (f: FormShape, set: (next: FormShape) => void) => (
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Primary artist(s)</label>
        <MultiSelect
          options={artistOptions}
          selected={f.primaryArtistIds}
          onChange={(ids) => set({ ...f, primaryArtistIds: ids })}
          placeholder="Select primary artist(s)"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Featured artist(s) — from catalogue</label>
        <MultiSelect
          options={artistOptions}
          selected={f.featureArtistIds}
          onChange={(ids) => set({ ...f, featureArtistIds: ids })}
          placeholder="Select featured artist(s)"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-gray-400">Other featured names (not in catalogue)</label>
        <Input
          value={f.featureArtistNames}
          onChange={(e) => set({ ...f, featureArtistNames: e.target.value })}
          placeholder="e.g. Guest Name, Another Artist"
          className="bg-black/40 border-white/10 text-white"
        />
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Upcoming releases"
        description="Schedule releases that aren't out yet. Link the artists from your catalogue so they stay consistent across the site."
      />

      <div className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Create */}
        <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-white/10 bg-[#141414] p-5">
          <h3 className="text-lg">Add upcoming release</h3>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setImageFile(file);
              setImagePreview(URL.createObjectURL(file));
            }}
            className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-white file:text-black hover:file:bg-gray-200"
          />
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="" className="h-24 w-24 rounded-md border border-white/10 object-cover" />
          ) : null}
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Release name"
            className="bg-black/40 border-white/10 text-white"
          />
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as FormShape["type"] })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
          >
            <option value="single">Single</option>
            <option value="ep">EP</option>
            <option value="album">Album</option>
          </select>
          <Input
            type="date"
            value={form.releaseDate}
            onChange={(e) => setForm({ ...form, releaseDate: e.target.value })}
            className="bg-black/40 border-white/10 text-white"
          />
          <Input
            type="url"
            value={form.preSmartLinkUrl}
            onChange={(e) => setForm({ ...form, preSmartLinkUrl: e.target.value })}
            placeholder="Pre-save link (e.g. https://ditto.fm/...)"
            className="bg-black/40 border-white/10 text-white"
          />
          {artistPicker(form, setForm)}
          <Button type="submit" className="bg-white text-black hover:bg-gray-200" disabled={isCreating}>
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isUploading ? "Uploading…" : "Saving…"}
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 h-4 w-4" /> Add upcoming release
              </>
            )}
          </Button>
        </form>

        {/* Scheduled list */}
        <div className="rounded-xl border border-white/10 bg-[#141414] p-5">
          <h3 className="mb-1 text-lg">Scheduled</h3>
          <p className="mb-4 text-xs text-gray-500">
            Drag the grip to set the order shown on the public home page. Order saves automatically.
          </p>
          {listRows.length === 0 ? (
            <p className="text-gray-400">No upcoming releases scheduled.</p>
          ) : (
            <UpcomingReleasesSortableList
              releases={listRows}
              onReorderSave={handleReorderSave}
              onEdit={(r) => {
                const full = upcomingReleases.find((x) => x.id === r.id);
                if (full) openEdit(full);
              }}
              onDelete={(id) => {
                const r = upcomingReleases.find((x) => x.id === id);
                setUpcomingToDelete({ id, name: r?.name ?? "this release" });
                setUpcomingDeleteOpen(true);
              }}
            />
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-[#141414] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Edit upcoming release</DialogTitle>
            <DialogDescription className="text-gray-400">
              Update cover art, pre-save link, linked artists, and release details.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <p className="mb-1 text-xs text-gray-500">Cover image — leave unchanged or pick a new file</p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setEditImageFile(file);
                  setEditImagePreview(URL.createObjectURL(file));
                }}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-white file:text-black hover:file:bg-gray-200"
              />
              {editImagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editImagePreview} alt="" className="mt-2 h-24 w-24 rounded-md border border-white/10 object-cover" />
              ) : null}
            </div>
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Release name"
              className="bg-black/40 border-white/10 text-white"
            />
            <select
              value={editForm.type}
              onChange={(e) => setEditForm({ ...editForm, type: e.target.value as FormShape["type"] })}
              className="w-full rounded-md border border-white/10 bg-black/40 px-3 py-2 text-white"
            >
              <option value="single">Single</option>
              <option value="ep">EP</option>
              <option value="album">Album</option>
            </select>
            <Input
              type="date"
              value={editForm.releaseDate}
              onChange={(e) => setEditForm({ ...editForm, releaseDate: e.target.value })}
              className="bg-black/40 border-white/10 text-white"
            />
            <Input
              type="url"
              value={editForm.preSmartLinkUrl}
              onChange={(e) => setEditForm({ ...editForm, preSmartLinkUrl: e.target.value })}
              placeholder="Pre-save link (e.g. https://ditto.fm/...)"
              className="bg-black/40 border-white/10 text-white"
            />
            {artistPicker(editForm, setEditForm)}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" className="border-white/10" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-white text-black hover:bg-gray-200" disabled={isSavingEdit}>
                {isSavingEdit ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isUploading ? "Uploading…" : "Saving…"}
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={upcomingDeleteOpen} onOpenChange={setUpcomingDeleteOpen}>
        <DialogContent className="bg-[#141414] text-white border-white/10">
          <DialogHeader>
            <DialogTitle>Delete upcoming release</DialogTitle>
            <DialogDescription className="text-gray-400">
              Are you sure you want to delete &quot;{upcomingToDelete?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-white/10"
              onClick={() => {
                setUpcomingDeleteOpen(false);
                setUpcomingToDelete(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
