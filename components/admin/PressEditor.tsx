"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Image as ImageIcon, Loader2, ExternalLink, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/local-ui/Toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";

type FormState = {
  title: string;
  publisher: string;
  articleUrl: string;
  author: string;
  publishedAt: string; // yyyy-mm-dd in the UI
  summary: string;
  showOnWebsite: boolean;
  artistIds: string[];
  releaseIds: string[];
};

const emptyForm: FormState = {
  title: "",
  publisher: "",
  articleUrl: "",
  author: "",
  publishedAt: "",
  summary: "",
  showOnWebsite: true,
  artistIds: [],
  releaseIds: [],
};

type Option = { value: string; label: string };

// Mirror lib/press-input.ts (PRESS_TITLE_MAX / PRESS_SUMMARY_MAX) — the server
// caps to these too, so a long headline/summary can't break the press-card layout.
const TITLE_MAX = 120;
const SUMMARY_MAX = 300;

export default function PressEditor({
  mode,
  pressId,
}: {
  mode: "create" | "edit";
  pressId?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(emptyForm);
  // Image: either a freshly chosen file (uploaded to S3 on save) or an existing/
  // pasted URL (rehosted server-side). One supersedes the other.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>(""); // existing or pasted URL
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [artistOptions, setArtistOptions] = useState<Option[]>([]);
  const [releaseOptions, setReleaseOptions] = useState<Option[]>([]);

  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  // Whether the item being edited is a draft (drives the primary button label).
  const [isDraft, setIsDraft] = useState(mode === "create");
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; publisher?: string; articleUrl?: string; summary?: string }>({});

  const [dirty, setDirty] = useState(false);
  const { confirmDiscard } = useUnsavedChangesGuard(dirty);
  const markDirty = () => setDirty(true);

  // Load artist + release options for the link pickers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [aRes, rRes] = await Promise.all([
          fetch("/api/artists"),
          fetch("/api/releases?page=1&pageSize=100"),
        ]);
        if (!cancelled && aRes.ok) {
          const artists = await aRes.json();
          setArtistOptions(
            (Array.isArray(artists) ? artists : []).map((a: { id: string; name: string }) => ({
              value: a.id,
              label: a.name,
            }))
          );
        }
        if (!cancelled && rRes.ok) {
          const data = await rRes.json();
          const items = Array.isArray(data) ? data : data.items || [];
          setReleaseOptions(
            items.map((r: { id: string; name: string }) => ({ value: r.id, label: r.name }))
          );
        }
      } catch {
        /* options are optional — the form still works without them */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load existing item in edit mode.
  useEffect(() => {
    if (mode !== "edit" || !pressId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/press/${pressId}`);
        if (!res.ok) throw new Error();
        const p = await res.json();
        if (cancelled) return;
        setForm({
          title: p.title || "",
          publisher: p.publisher || "",
          articleUrl: p.articleUrl || "",
          author: p.author || "",
          publishedAt: p.publishedAt ? String(p.publishedAt).slice(0, 10) : "",
          summary: p.summary || "",
          showOnWebsite: p.showOnWebsite !== false,
          artistIds: Array.isArray(p.artistIds) ? p.artistIds : [],
          releaseIds: Array.isArray(p.releaseIds) ? p.releaseIds : [],
        });
        setImageUrl(p.image || "");
        setImagePreview(p.image || null);
        setIsDraft(p.draft === true);
      } catch {
        toast.error("Failed to load press item");
        router.push("/admin/catalog/press");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, pressId, router, toast]);

  useEffect(() => {
    return () => {
      if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const setField = (name: keyof FormState, value: string) => {
    markDirty();
    setForm((p) => ({ ...p, [name]: value }));
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    markDirty();
    setImageFile(file);
    setImageUrl("");
    if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File): Promise<string> => {
    const timestamp = Date.now();
    const imageFileName = `press/images/${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
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

  // Publishing requires title + publisher + a valid article URL + summary. A
  // DRAFT only needs a title; the rest can be filled in before publishing (a URL,
  // if provided, must still be a valid http(s) link).
  const save = async (draft: boolean) => {
    const fieldErrors: typeof errors = {};
    if (!form.title.trim()) fieldErrors.title = "Title is required";
    if (!draft) {
      if (!form.publisher.trim()) fieldErrors.publisher = "Publisher is required";
      if (!form.articleUrl.trim()) fieldErrors.articleUrl = "Article URL is required";
      else if (!/^https?:\/\//i.test(form.articleUrl.trim()))
        fieldErrors.articleUrl = "Must be a full http(s) URL";
      if (!form.summary.trim()) fieldErrors.summary = "A short summary is required";
    } else if (form.articleUrl.trim() && !/^https?:\/\//i.test(form.articleUrl.trim())) {
      fieldErrors.articleUrl = "Must be a full http(s) URL";
    }
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
        title: form.title,
        publisher: form.publisher,
        articleUrl: form.articleUrl,
        author: form.author,
        publishedAt: form.publishedAt || null,
        summary: form.summary,
        image: finalImage || null,
        artistIds: form.artistIds,
        releaseIds: form.releaseIds,
        draft,
      };

      const res = await fetch(
        mode === "edit" ? `/api/press/${pressId}` : "/api/press",
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
      // Visibility isn't part of POST/PUT; sync it in edit mode.
      if (mode === "edit" && pressId) {
        await fetch(`/api/press/${pressId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showOnWebsite: form.showOnWebsite }),
        }).catch(() => {});
      }
      setDirty(false);
      toast.success(draft ? "Draft saved" : mode === "edit" ? "Press item saved" : "Press item created");
      router.push("/admin/catalog/press");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // Form submit / primary button = publish (full validation).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save(false);
  };

  // Delete the press item (edit mode only), then return to the list.
  const handleDelete = async () => {
    if (mode !== "edit" || !pressId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/press/${pressId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDirty(false);
      toast.success("Press item deleted");
      router.push("/admin/catalog/press");
    } catch {
      toast.error("Failed to delete press item");
      setDeleting(false);
      setConfirmDeleteOpen(false);
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
        onClick={() => {
          if (confirmDiscard()) router.push("/admin/catalog/press");
        }}
        className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to press
      </Button>

      <PageHeader title={mode === "edit" ? "Edit press item" : "New press item"} />

      <form onSubmit={handleSubmit} className="max-w-4xl">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Image */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-border bg-card p-6">
              <label className="mb-4 block text-sm font-medium text-muted-foreground">
                Article image
              </label>
              {imagePreview ? (
                <div className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="aspect-video w-full rounded-lg border border-border object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      markDirty();
                      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
                      setImageFile(null);
                      setImageUrl("");
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
                  className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-border cursor-pointer hover:border-gray-600"
                >
                  <ImageIcon className="mb-3 h-10 w-10 text-gray-500" />
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
              <div className="mt-4">
                <label htmlFor="imageUrl" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  …or paste an image URL
                </label>
                <Input
                  id="imageUrl"
                  value={imageFile ? "" : imageUrl}
                  disabled={!!imageFile}
                  onChange={(e) => {
                    markDirty();
                    setImageUrl(e.target.value);
                    setImagePreview(e.target.value || null);
                  }}
                  placeholder="https://…/article-image.jpg"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  External images are copied to our own storage on save.
                </p>
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-6 lg:col-span-2">
            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-medium">Coverage</h3>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="title" className="block text-xs font-medium text-muted-foreground">
                    Headline *
                  </label>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      form.title.length >= TITLE_MAX ? "text-amber-400" : "text-muted-foreground"
                    }`}
                  >
                    {form.title.length}/{TITLE_MAX}
                  </span>
                </div>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => {
                    setField("title", e.target.value);
                    if (errors.title) setErrors((p) => ({ ...p, title: undefined }));
                  }}
                  maxLength={TITLE_MAX}
                  placeholder="Headline of your summary *"
                  className={errors.title ? "border-red-500/70" : ""}
                />
                {errors.title ? <p className="mt-1 text-sm text-red-400">{errors.title}</p> : null}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Input
                    value={form.publisher}
                    onChange={(e) => {
                      setField("publisher", e.target.value);
                      if (errors.publisher) setErrors((p) => ({ ...p, publisher: undefined }));
                    }}
                    placeholder="Publisher / blog *"
                    className={errors.publisher ? "border-red-500/70" : ""}
                  />
                  {errors.publisher ? <p className="mt-1 text-sm text-red-400">{errors.publisher}</p> : null}
                </div>
                <Input
                  value={form.author}
                  onChange={(e) => setField("author", e.target.value)}
                  placeholder="Author (optional)"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="articleUrl" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Article URL *
                  </label>
                  <Input
                    id="articleUrl"
                    value={form.articleUrl}
                    onChange={(e) => {
                      setField("articleUrl", e.target.value);
                      if (errors.articleUrl) setErrors((p) => ({ ...p, articleUrl: undefined }));
                    }}
                    placeholder="https://…"
                    className={errors.articleUrl ? "border-red-500/70" : ""}
                  />
                  {errors.articleUrl ? <p className="mt-1 text-sm text-red-400">{errors.articleUrl}</p> : null}
                </div>
                <div>
                  <label htmlFor="publishedAt" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Published date
                  </label>
                  <Input
                    id="publishedAt"
                    type="date"
                    value={form.publishedAt}
                    onChange={(e) => setField("publishedAt", e.target.value)}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="summary" className="block text-xs font-medium text-muted-foreground">
                    Summary * <span className="font-normal">(our own words — do not paste the article)</span>
                  </label>
                  <span
                    className={`shrink-0 text-xs tabular-nums ${
                      form.summary.length >= SUMMARY_MAX ? "text-amber-400" : "text-muted-foreground"
                    }`}
                  >
                    {form.summary.length}/{SUMMARY_MAX}
                  </span>
                </div>
                <Textarea
                  id="summary"
                  value={form.summary}
                  onChange={(e) => {
                    setField("summary", e.target.value);
                    if (errors.summary) setErrors((p) => ({ ...p, summary: undefined }));
                  }}
                  maxLength={SUMMARY_MAX}
                  placeholder="A short, original summary of what the coverage said and why it matters…"
                  rows={5}
                  className={`resize-none ${errors.summary ? "border-red-500/70" : ""}`}
                />
                {errors.summary ? <p className="mt-1 text-sm text-red-400">{errors.summary}</p> : null}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border bg-card p-6">
              <h3 className="text-lg font-medium">Linked to</h3>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Artists</label>
                <MultiSelect
                  options={artistOptions}
                  selected={form.artistIds}
                  onChange={(v) => {
                    markDirty();
                    setForm((p) => ({ ...p, artistIds: v }));
                  }}
                  placeholder="Link artists…"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Releases</label>
                <MultiSelect
                  options={releaseOptions}
                  selected={form.releaseIds}
                  onChange={(v) => {
                    markDirty();
                    setForm((p) => ({ ...p, releaseIds: v }));
                  }}
                  placeholder="Link releases…"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Linked artists/releases show this item in their “Press &amp; Features” section.
                Only public artists/releases are linked on the live site.
              </p>
              {mode === "edit" ? (
                <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={form.showOnWebsite}
                    onChange={(e) => {
                      markDirty();
                      setForm((p) => ({ ...p, showOnWebsite: e.target.checked }));
                    }}
                    className="h-4 w-4 rounded border-gray-600 bg-black accent-white"
                  />
                  Show on website
                </label>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving} className="bg-white text-black hover:bg-gray-200">
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {uploading ? "Uploading…" : "Saving…"}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {isDraft ? "Publish press item" : mode === "edit" ? "Save press item" : "Create press item"}
                  </>
                )}
              </Button>
              {/* Draft = save incomplete work (only a title required), kept hidden. */}
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => save(true)}
                title="Save incomplete work as a hidden draft to finish later"
              >
                Save as draft
              </Button>
              {form.articleUrl && /^https?:\/\//i.test(form.articleUrl) ? (
                <Button type="button" variant="outline" asChild>
                  <a href={form.articleUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" /> Open article
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (confirmDiscard()) router.push("/admin/catalog/press");
                }}
              >
                Cancel
              </Button>
              {mode === "edit" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="ml-auto border-red-500/30 text-red-400 hover:bg-red-950/20 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </form>

      <Dialog open={confirmDeleteOpen} onOpenChange={(o) => !deleting && setConfirmDeleteOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete press item</DialogTitle>
            <DialogDescription>
              Delete &quot;{form.title || "this press item"}&quot;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
