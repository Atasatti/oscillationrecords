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
  Lock,
  Link2,
  Database,
  ExternalLink,
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
import type { MbArtistMatch } from "@/lib/musicbrainz";
import type { IsniMatch } from "@/lib/isni";
import { buildArtistSeedUrl, buildArtistEditUrl } from "@/lib/musicbrainz-seed";
import GenrePicker from "@/components/admin/GenrePicker";

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

// Internal (admin-only) fields — never shown on the public site.
const INTERNAL_FIELDS = [
  ["realName", "Real / legal name", "Jane Doe"],
  ["country", "Country", "United Kingdom"],
  ["city", "City", "London"],
  ["managerName", "Manager", "Manager name"],
  ["contactEmail", "Contact email", "manager@example.com"],
] as const;

type InternalKey = (typeof INTERNAL_FIELDS)[number][0];

type FormState = {
  name: string;
  biography: string;
  showOnWebsite: boolean;
  genres: string; // comma-separated in the UI; normalized server-side
  spotifyId: string;
  musicBrainzId: string;
  internalNotes: string;
  ipis: string; // comma-separated in the UI
  isni: string;
} & Record<LinkKey, string> &
  Record<InternalKey, string>;

const emptyForm: FormState = {
  name: "",
  biography: "",
  showOnWebsite: true,
  genres: "",
  spotifyId: "",
  musicBrainzId: "",
  realName: "",
  country: "",
  city: "",
  managerName: "",
  contactEmail: "",
  internalNotes: "",
  ipis: "",
  isni: "",
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

  // MusicBrainz social-link import (free; no config needed)
  const [mbOpen, setMbOpen] = useState(false);
  const [mbQuery, setMbQuery] = useState("");
  const [mbResults, setMbResults] = useState<MbArtistMatch[]>([]);
  const [mbSearching, setMbSearching] = useState(false);
  const [mbResolving, setMbResolving] = useState(false);
  // Resolved links pending the admin's confirmation.
  const [mbPreview, setMbPreview] = useState<Partial<Record<LinkKey, string>> | null>(null);
  const [mbPickedName, setMbPickedName] = useState("");
  const [mbIsni, setMbIsni] = useState<string | null>(null);
  const [mbIpis, setMbIpis] = useState<string[]>([]);
  const [mbGenres, setMbGenres] = useState<string[]>([]);

  // ISNI name lookup (public OCLC SRU)
  const [isniOpen, setIsniOpen] = useState(false);
  const [isniQuery, setIsniQuery] = useState("");
  const [isniResults, setIsniResults] = useState<IsniMatch[]>([]);
  const [isniSearching, setIsniSearching] = useState(false);

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
          genres: Array.isArray(a.genres) ? a.genres.join(", ") : "",
          spotifyId: a.spotifyId || "",
          musicBrainzId: a.musicBrainzId || "",
          realName: a.realName || "",
          country: a.country || "",
          city: a.city || "",
          managerName: a.managerName || "",
          contactEmail: a.contactEmail || "",
          internalNotes: a.internalNotes || "",
          ipis: Array.isArray(a.ipis) ? a.ipis.join(", ") : "",
          isni: a.isni || "",
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
      spotifyId: a.id || p.spotifyId,
      // Only fill genres if the admin hasn't entered any (don't clobber).
      genres: p.genres.trim() ? p.genres : (a.genres || []).join(", "),
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

  const runMbSearch = async () => {
    if (!mbQuery.trim()) return;
    setMbSearching(true);
    setMbPreview(null);
    try {
      const res = await fetch(`/api/admin/musicbrainz?q=${encodeURIComponent(mbQuery)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMbResults(data.artists || []);
    } catch {
      toast.error("MusicBrainz search failed");
    } finally {
      setMbSearching(false);
    }
  };

  const pickMbArtist = async (m: MbArtistMatch) => {
    setMbResolving(true);
    setMbPickedName(m.name);
    try {
      const res = await fetch(`/api/admin/musicbrainz?mbid=${encodeURIComponent(m.mbid)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      const links = (data.links || {}) as Partial<Record<LinkKey, string>>;
      const isnis = (data.isnis || []) as string[];
      const ipis = (data.ipis || []) as string[];
      const genres = (data.genres || []) as string[];
      // Record the MB link regardless — picking the artist establishes it, even
      // if the MB page has no links/codes yet (e.g. a freshly-added artist).
      setForm((p) => ({ ...p, musicBrainzId: m.mbid }));
      if (Object.keys(links).length === 0 && isnis.length === 0 && ipis.length === 0 && genres.length === 0) {
        toast.success("Linked to MusicBrainz. That page has no links/codes yet — nothing to import.");
        setMbOpen(false);
        return;
      }
      setMbPreview(links);
      setMbIsni(isnis[0] || null);
      setMbIpis(ipis);
      setMbGenres(genres);
    } catch {
      toast.error("Couldn't load data from MusicBrainz");
    } finally {
      setMbResolving(false);
    }
  };

  // Apply ONLY to currently-empty link fields; never overwrite what's filled.
  // Also fills ISNI (if empty) and merges any IPI codes found.
  const applyMbLinks = () => {
    if (!mbPreview) return;
    let applied = 0;
    let skipped = 0;
    setForm((p) => {
      const next = { ...p };
      (Object.entries(mbPreview) as [LinkKey, string][]).forEach(([key, url]) => {
        if (next[key].trim()) {
          skipped++;
        } else {
          next[key] = url;
          applied++;
        }
      });
      if (mbIsni && !next.isni.trim()) {
        next.isni = mbIsni;
        applied++;
      }
      if (mbIpis.length) {
        const have = new Set(next.ipis.split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean));
        const add = mbIpis.filter((x) => !have.has(x.replace(/\D/g, "")));
        if (add.length) {
          next.ipis = [next.ipis.trim(), ...add].filter(Boolean).join(", ");
          applied += add.length;
        }
      }
      // Fill genres only if empty (don't clobber what the admin typed).
      if (mbGenres.length && !next.genres.trim()) {
        next.genres = mbGenres.join(", ");
        applied += mbGenres.length;
      }
      return next;
    });
    setMbOpen(false);
    setMbPreview(null);
    setMbIsni(null);
    setMbIpis([]);
    setMbGenres([]);
    toast.success(
      `Added ${applied} item${applied === 1 ? "" : "s"}${skipped ? `, kept ${skipped} existing` : ""} — review and save.`
    );
  };

  const runIsniSearch = async () => {
    if (!isniQuery.trim()) return;
    setIsniSearching(true);
    try {
      const res = await fetch(`/api/admin/isni?q=${encodeURIComponent(isniQuery)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIsniResults(data.matches || []);
    } catch {
      toast.error("ISNI search failed");
    } finally {
      setIsniSearching(false);
    }
  };

  const pickIsni = (m: IsniMatch) => {
    setField("isni", m.isni);
    setIsniOpen(false);
    toast.success(`ISNI set to ${m.isni} — review and save.`);
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
        genres: form.genres,
        spotifyId: form.spotifyId,
        musicBrainzId: form.musicBrainzId,
        realName: form.realName,
        country: form.country,
        city: form.city,
        managerName: form.managerName,
        contactEmail: form.contactEmail,
        internalNotes: form.internalNotes,
        ipis: form.ipis,
        isni: form.isni,
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
          <div className="flex flex-wrap gap-2">
            {spotifyEnabled ? (
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
                <Search className="h-4 w-4" /> Import from Spotify
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMbQuery(form.name);
                setMbResults([]);
                setMbPreview(null);
                setMbOpen(true);
              }}
            >
              <Link2 className="h-4 w-4" /> Import from MusicBrainz
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!form.name.trim()}
              title={
                form.musicBrainzId
                  ? "Open this artist's MusicBrainz edit page, pre-filled with our links/codes"
                  : "Open a pre-filled MusicBrainz “Add Artist” submission to review and submit"
              }
              onClick={() => {
                const seed = {
                  name: form.name,
                  country: form.country,
                  city: form.city,
                  genres: form.genres.split(",").map((g) => g.trim()).filter(Boolean),
                  isni: form.isni,
                  ipis: form.ipis.split(",").map((s) => s.trim()).filter(Boolean),
                  urls: LINK_FIELDS.map(([k]) => form[k]),
                };
                const url = form.musicBrainzId
                  ? buildArtistEditUrl(form.musicBrainzId, seed)
                  : buildArtistSeedUrl(seed);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Database className="h-4 w-4" />
              {form.musicBrainzId ? "Open on MusicBrainz" : "Add to MusicBrainz"}
            </Button>
          </div>
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
              <div>
                <label htmlFor="genres" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Genres
                </label>
                <GenrePicker
                  id="genres"
                  value={form.genres}
                  onChange={(v) => setField("genres", v)}
                  placeholder="e.g. House, Techno, Melodic"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Comma-separated. Use “Browse” to pick from real Spotify genres, or
                  import from MusicBrainz (Spotify no longer provides genres via its API).
                </p>
              </div>
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
              <div className="mt-4">
                <label htmlFor="spotifyId" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Spotify artist ID
                </label>
                <Input
                  id="spotifyId"
                  name="spotifyId"
                  value={form.spotifyId}
                  onChange={(e) => setField("spotifyId", e.target.value)}
                  placeholder="Auto-filled on import — used to re-sync"
                  className="font-mono text-sm"
                />
              </div>
            </div>

            {/* Internal — never shown publicly */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] p-6">
              <div className="mb-1 flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-400/80" />
                <h3 className="text-lg font-medium">Identity &amp; internal</h3>
              </div>
              <p className="mb-4 text-xs text-amber-200/70">
                Internal — not shown publicly. For your team only.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {INTERNAL_FIELDS.map(([key, label, placeholder]) => (
                  <div key={key}>
                    <label htmlFor={key} className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {label}
                    </label>
                    <Input
                      id={key}
                      name={key}
                      type={key === "contactEmail" ? "email" : "text"}
                      value={form[key]}
                      onChange={(e) => setField(key, e.target.value)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="isni" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    ISNI
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="isni"
                      name="isni"
                      value={form.isni}
                      onChange={(e) => setField("isni", e.target.value)}
                      placeholder="16 digits"
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsniQuery(form.name);
                        setIsniResults([]);
                        setIsniOpen(true);
                      }}
                    >
                      <Search className="h-4 w-4" /> Find
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Often auto-assigned once on streaming. Use Find, or “Import from MusicBrainz” pulls it in.
                  </p>
                </div>
                <div>
                  <label htmlFor="ipis" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    IPI number(s)
                  </label>
                  <Input
                    id="ipis"
                    name="ipis"
                    value={form.ipis}
                    onChange={(e) => setField("ipis", e.target.value)}
                    placeholder="comma-separated"
                    className="font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    From the writer’s PRO/publisher. Look up on{" "}
                    <a
                      href="https://www.ascap.com/repertory"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      ASCAP
                    </a>{" "}
                    or{" "}
                    <a
                      href="https://repertoire.bmi.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      BMI
                    </a>
                    .
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <label htmlFor="musicBrainzId" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  MusicBrainz ID
                </label>
                <div className="flex gap-2">
                  <Input
                    id="musicBrainzId"
                    name="musicBrainzId"
                    value={form.musicBrainzId}
                    onChange={(e) => setField("musicBrainzId", e.target.value)}
                    placeholder="Set by “Import from MusicBrainz”"
                    className="font-mono text-sm"
                  />
                  {form.musicBrainzId ? (
                    <Button type="button" variant="outline" asChild>
                      <a
                        href={`https://musicbrainz.org/artist/${form.musicBrainzId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" /> View
                      </a>
                    </Button>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Links this artist to their MusicBrainz page — a strong SEO “sameAs”
                  signal. Filled automatically by “Import from MusicBrainz”.
                </p>
              </div>
              <div className="mt-4">
                <label htmlFor="internalNotes" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Notes
                </label>
                <Textarea
                  id="internalNotes"
                  name="internalNotes"
                  value={form.internalNotes}
                  onChange={(e) => setField("internalNotes", e.target.value)}
                  placeholder="Private notes about this artist…"
                  rows={3}
                  className="resize-none"
                />
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

      {/* MusicBrainz social-link import dialog */}
      <Dialog open={mbOpen} onOpenChange={setMbOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from MusicBrainz</DialogTitle>
            <DialogDescription>
              Searches the free MusicBrainz database and, when you pick a match,
              links this artist (sets their <strong className="text-foreground">MusicBrainz ID</strong>)
              and imports social &amp; streaming links, genres and ISNI/IPI codes.
              Coverage varies — review before applying. Only empty fields are filled;
              your existing values are never overwritten.
            </DialogDescription>
          </DialogHeader>

          {mbPreview ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Found for <span className="text-foreground">{mbPickedName}</span>:
              </p>
              {form.musicBrainzId ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
                  <span className="w-24 shrink-0 font-medium">MusicBrainz ID</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{form.musicBrainzId}</span>
                  <span className="shrink-0 rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-400">linked</span>
                </div>
              ) : null}
              {(mbIsni || mbIpis.length || mbGenres.length) ? (
                <ul className="space-y-2">
                  {mbGenres.length ? (
                    <li className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
                      <span className="w-24 shrink-0 font-medium">Genres</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{mbGenres.join(", ")}</span>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                          form.genres.trim() ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-400"
                        }`}
                      >
                        {form.genres.trim() ? "keep existing" : "will add"}
                      </span>
                    </li>
                  ) : null}
                  {mbIsni ? (
                    <li className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
                      <span className="w-24 shrink-0 font-medium">ISNI</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{mbIsni}</span>
                      <span
                        className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                          form.isni.trim() ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-400"
                        }`}
                      >
                        {form.isni.trim() ? "keep existing" : "will add"}
                      </span>
                    </li>
                  ) : null}
                  {mbIpis.length ? (
                    <li className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm">
                      <span className="w-24 shrink-0 font-medium">IPI</span>
                      <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">{mbIpis.join(", ")}</span>
                      <span className="shrink-0 rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-400">merge</span>
                    </li>
                  ) : null}
                </ul>
              ) : null}
              <ul className="space-y-2">
                {(Object.entries(mbPreview) as [LinkKey, string][]).map(([key, url]) => {
                  const label = LINK_FIELDS.find(([k]) => k === key)?.[1] || key;
                  const willKeep = form[key].trim().length > 0;
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-3 rounded-lg border border-border p-2 text-sm"
                    >
                      <span className="w-24 shrink-0 font-medium">{label}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{url}</span>
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
                  placeholder="Artist name…"
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
                      onClick={() => pickMbArtist(m)}
                      className="flex w-full items-center gap-3 rounded-lg border border-border p-2 text-left hover:bg-white/[0.04]"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[m.disambiguation, m.country].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))
                )}
                {!mbSearching && !mbResolving && mbQuery && mbResults.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No matches — try a different spelling.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ISNI lookup dialog */}
      <Dialog open={isniOpen} onOpenChange={setIsniOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Find ISNI</DialogTitle>
            <DialogDescription>
              Searches the public ISNI registry by name. It lists every kind of
              entity (companies too), so verify via the sources/links shown —
              music entries are flagged and listed first. For artists already on
              MusicBrainz, “Import from MusicBrainz” returns the ISNI without guessing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              value={isniQuery}
              onChange={(e) => setIsniQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runIsniSearch();
                }
              }}
              placeholder="Artist name…"
              autoFocus
            />
            <Button type="button" onClick={runIsniSearch} disabled={isniSearching}>
              {isniSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {isniResults.map((m) => {
              const hostOf = (u: string) => {
                try {
                  return new URL(u).host.replace(/^www\./, "");
                } catch {
                  return "link";
                }
              };
              return (
                <div
                  key={m.isni}
                  className={`rounded-lg border p-2.5 ${
                    m.isMusic ? "border-green-500/30 bg-green-500/[0.03]" : "border-border"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {m.name}
                        {m.isMusic ? (
                          <span className="shrink-0 rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
                            ♪ music
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {m.isni}
                        {m.type ? ` · ${m.type}` : ""}
                      </p>
                      {m.sources.length ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          Sources: {m.sources.join(", ")}
                        </p>
                      ) : null}
                      {m.works.length ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          Works: {m.works.join(", ")}
                        </p>
                      ) : null}
                      {m.links.length ? (
                        <p className="mt-1 flex flex-wrap gap-2 text-xs">
                          {m.links.map((l) => (
                            <a
                              key={l}
                              href={l}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 underline hover:text-blue-300"
                            >
                              {hostOf(l)} ↗
                            </a>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => pickIsni(m)}>
                      <Check className="h-4 w-4" /> Use
                    </Button>
                  </div>
                </div>
              );
            })}
            {!isniSearching && isniQuery && isniResults.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No ISNI matches — they may not have one yet.
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
