"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  Loader2,
  Search,
  Check,
} from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import type { SpotifyArtist } from "@/lib/spotify";

const LINK_FIELDS = [
  ["xLink", "X (Twitter)", "https://x.com/username"],
  ["tiktokLink", "TikTok", "https://tiktok.com/@username"],
  ["spotifyLink", "Spotify", "https://open.spotify.com/artist/..."],
  ["instagramLink", "Instagram", "https://instagram.com/username"],
  ["youtubeLink", "YouTube", "https://youtube.com/@username"],
  ["facebookLink", "Facebook", "https://facebook.com/username"],
  ["appleMusicLink", "Apple Music", "https://music.apple.com/..."],
  ["tidalLink", "Tidal", "https://tidal.com/..."],
  ["amazonMusicLink", "Amazon Music", "https://music.amazon.com/..."],
  ["soundcloudLink", "SoundCloud", "https://soundcloud.com/..."],
] as const;

type LinkKey = (typeof LINK_FIELDS)[number][0];

type FormState = {
  name: string;
  biography: string;
  showOnWebsite: boolean;
} & Record<LinkKey, string>;

const emptyForm: FormState = {
  name: "",
  biography: "",
  showOnWebsite: true,
  xLink: "",
  tiktokLink: "",
  spotifyLink: "",
  instagramLink: "",
  youtubeLink: "",
  facebookLink: "",
  appleMusicLink: "",
  tidalLink: "",
  amazonMusicLink: "",
  soundcloudLink: "",
};

export default function ArtistEditor({
  mode,
  artistId,
}: {
  mode: "create" | "edit";
  artistId?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null); // existing/imported URL
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; image?: string }>({});
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Spotify import
  const [spotifyEnabled, setSpotifyEnabled] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importQuery, setImportQuery] = useState("");
  const [importResults, setImportResults] = useState<SpotifyArtist[]>([]);
  const [importing, setImporting] = useState(false);

  // Detect whether Spotify is configured (cheap probe; empty q).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/spotify/search");
        if (!cancelled) setSpotifyEnabled(res.ok);
      } catch {
        if (!cancelled) setSpotifyEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load existing artist in edit mode.
  useEffect(() => {
    if (mode !== "edit" || !artistId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/artists/${artistId}`);
        if (!res.ok) throw new Error();
        const a = await res.json();
        if (cancelled) return;
        setForm({
          name: a.name || "",
          biography: a.biography || "",
          showOnWebsite: a.showOnWebsite !== false,
          xLink: a.xLink || "",
          tiktokLink: a.tiktokLink || "",
          spotifyLink: a.spotifyLink || "",
          instagramLink: a.instagramLink || "",
          youtubeLink: a.youtubeLink || "",
          facebookLink: a.facebookLink || "",
          appleMusicLink: a.appleMusicLink || "",
          tidalLink: a.tidalLink || "",
          amazonMusicLink: a.amazonMusicLink || "",
          soundcloudLink: a.soundcloudLink || "",
        });
        setImageUrl(a.profilePicture || null);
        setImagePreview(a.profilePicture || null);
      } catch {
        toast.error("Failed to load artist");
        router.push("/admin/catalog/artists");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, artistId, router, toast]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const setField = (name: keyof FormState, value: string) =>
    setForm((p) => ({ ...p, [name]: value }));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl(null);
    if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
    setErrors((p) => ({ ...p, image: undefined }));
  };

  const runImportSearch = async () => {
    if (!importQuery.trim()) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/admin/spotify/search?q=${encodeURIComponent(importQuery)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setImportResults(data.artists || []);
    } catch {
      toast.error("Spotify search failed");
    } finally {
      setImporting(false);
    }
  };

  const applyImport = (a: SpotifyArtist) => {
    setForm((p) => ({
      ...p,
      name: a.name || p.name,
      spotifyLink: a.spotifyUrl || p.spotifyLink,
    }));
    if (a.imageUrl) {
      setImageFile(null);
      setImageUrl(a.imageUrl);
      setImagePreview(a.imageUrl);
      setErrors((p) => ({ ...p, image: undefined }));
    }
    setImportOpen(false);
    toast.success(`Imported “${a.name}” from Spotify — review and save.`);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const imageFileName = `artists/images/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const presign = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageFileName, imageFileType: file.type }),
    });
    if (!presign.ok) throw new Error("Failed to get upload URL");
    const { uploadURL, fileURL } = await presign.json();
    const put = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) throw new Error("Image upload failed");
    return fileURL;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors: typeof errors = {};
    if (!form.name.trim()) fieldErrors.name = "Artist name is required";
    if (!imageFile && !imageUrl) fieldErrors.image = "A profile picture is required";
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      let finalImage = imageUrl;
      if (imageFile) {
        setUploading(true);
        finalImage = await uploadImage(imageFile);
        setUploading(false);
      }

      const payload = {
        name: form.name,
        biography: form.biography,
        profilePicture: finalImage,
        xLink: form.xLink,
        tiktokLink: form.tiktokLink,
        spotifyLink: form.spotifyLink,
        instagramLink: form.instagramLink,
        youtubeLink: form.youtubeLink,
        facebookLink: form.facebookLink,
        appleMusicLink: form.appleMusicLink,
        tidalLink: form.tidalLink,
        amazonMusicLink: form.amazonMusicLink,
        soundcloudLink: form.soundcloudLink,
      };

      const res = await fetch(
        mode === "edit" ? `/api/artists/${artistId}` : "/api/artists",
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      // Visibility isn't part of POST/PUT; sync it in edit mode if changed.
      if (mode === "edit" && artistId) {
        await fetch(`/api/artists/${artistId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showOnWebsite: form.showOnWebsite }),
        }).catch(() => {});
      }
      toast.success(mode === "edit" ? "Artist saved" : "Artist created");
      router.push("/admin/catalog/artists");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <Button
        variant="ghost"
        onClick={() => router.push("/admin/catalog/artists")}
        className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to artists
      </Button>

      <PageHeader
        title={mode === "edit" ? "Edit artist" : "New artist"}
        actions={
          spotifyEnabled ? (
            <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
              <Search className="h-4 w-4" /> Import from Spotify
            </Button>
          ) : undefined
        }
      />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Image */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-border bg-card p-6">
              <label className="mb-4 block text-sm font-medium text-muted-foreground">
                Profile picture *
              </label>
              {imagePreview ? (
                <div className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="aspect-square w-full rounded-lg border border-border object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
                      setImageFile(null);
                      setImageUrl(null);
                      setImagePreview(null);
                      if (imageInputRef.current) imageInputRef.current.value = "";
                    }}
                    className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg border-2 border-dashed ${
                    errors.image ? "border-red-500/70" : "border-border"
                  } cursor-pointer hover:border-gray-600`}
                >
                  <ImageIcon className="mb-3 h-12 w-12 text-gray-500" />
                  <p className="text-sm text-muted-foreground">Click to upload</p>
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              {errors.image ? (
                <p className="mt-2 text-sm text-red-400">{errors.image}</p>
              ) : null}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-6 lg:col-span-2">
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-medium">Basic information</h3>
              <div>
                <Input
                  name="name"
                  value={form.name}
                  onChange={(e) => {
                    setField("name", e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Artist name *"
                  aria-invalid={errors.name ? true : undefined}
                  className={errors.name ? "border-red-500/70" : ""}
                />
                {errors.name ? (
                  <p className="mt-1 text-sm text-red-400">{errors.name}</p>
                ) : null}
              </div>
              <Textarea
                name="biography"
                value={form.biography}
                onChange={(e) => setField("biography", e.target.value)}
                placeholder="Biography"
                rows={5}
                className="resize-none"
              />
              {mode === "edit" ? (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.showOnWebsite}
                    onChange={(e) => setForm((p) => ({ ...p, showOnWebsite: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
                  />
                  Show on website
                </label>
              ) : null}
            </div>

            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="mb-4 text-lg font-medium">Links</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {LINK_FIELDS.map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label htmlFor={key} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {label}
                    </label>
                    <Input
                      id={key}
                      name={key}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={saving} className="bg-white text-black hover:bg-gray-200">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploading ? "Uploading…" : "Saving…"}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {mode === "edit" ? "Save artist" : "Create artist"}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/admin/catalog/artists")}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </form>

      {/* Spotify import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Spotify</DialogTitle>
            <DialogDescription>
              Search for the artist and pick a match to auto-fill name, photo, and
              Spotify link. You can edit everything before saving.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={importQuery}
              onChange={(e) => setImportQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runImportSearch();
                }
              }}
              placeholder="Artist name…"
              autoFocus
            />
            <Button type="button" onClick={runImportSearch} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {importResults.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => applyImport(a)}
                className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-white/[0.04]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.imageUrl || "/placeholder.svg"}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.followers != null ? `${a.followers.toLocaleString()} followers` : ""}
                    {a.genres.length ? ` · ${a.genres.slice(0, 3).join(", ")}` : ""}
                  </p>
                </div>
                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
            {!importing && importQuery && importResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No matches — try a different spelling.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
