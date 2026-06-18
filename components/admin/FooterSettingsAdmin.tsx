"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes";

type FooterForm = {
  xLink: string;
  tiktokLink: string;
  youtubeLink: string;
  instagramLink: string;
  facebookLink: string;
  spotifyLink: string;
  soundcloudLink: string;
  bandcampLink: string;
  beatportLink: string;
};

const EMPTY: FooterForm = {
  xLink: "",
  tiktokLink: "",
  youtubeLink: "",
  instagramLink: "",
  facebookLink: "",
  spotifyLink: "",
  soundcloudLink: "",
  bandcampLink: "",
  beatportLink: "",
};

const LABELS: { key: keyof FooterForm; label: string; placeholder: string }[] =
  [
    { key: "xLink", label: "X (Twitter)", placeholder: "https://x.com/..." },
    { key: "tiktokLink", label: "TikTok", placeholder: "https://tiktok.com/..." },
    { key: "youtubeLink", label: "YouTube", placeholder: "https://youtube.com/..." },
    {
      key: "instagramLink",
      label: "Instagram",
      placeholder: "https://instagram.com/...",
    },
    {
      key: "facebookLink",
      label: "Facebook",
      placeholder: "https://facebook.com/...",
    },
    { key: "spotifyLink", label: "Spotify", placeholder: "https://open.spotify.com/..." },
    {
      key: "soundcloudLink",
      label: "SoundCloud",
      placeholder: "https://soundcloud.com/...",
    },
    {
      key: "bandcampLink",
      label: "Bandcamp",
      placeholder: "https://yourname.bandcamp.com/...",
    },
    {
      key: "beatportLink",
      label: "Beatport",
      placeholder: "https://www.beatport.com/artist/...",
    },
  ];

export default function FooterSettingsAdmin() {
  const toast = useToast();
  const [form, setForm] = useState<FooterForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Typed-but-unsaved link edits — guard navigation/tab switch.
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings/footer");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setForm({
              xLink: data.xLink ?? "",
              tiktokLink: data.tiktokLink ?? "",
              youtubeLink: data.youtubeLink ?? "",
              instagramLink: data.instagramLink ?? "",
              facebookLink: data.facebookLink ?? "",
              spotifyLink: data.spotifyLink ?? "",
              soundcloudLink: data.soundcloudLink ?? "",
              bandcampLink: data.bandcampLink ?? "",
              beatportLink: data.beatportLink ?? "",
            });
          }
        }
      } catch {
        if (!cancelled) toast.error("Could not load footer links.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-settings/footer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      toast.success(
        "Footer social links saved — they'll appear on the site within a few minutes."
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-16 md:mt-20 rounded-2xl border border-white/10 bg-[#141414] p-6 md:p-8">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
          Site footer
        </p>
        <h2 className="text-xl md:text-2xl font-light tracking-tighter text-white mt-1">
          Social links
        </h2>
        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
          URLs for icons in the public footer. Leave a field empty to hide that
          icon.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {LABELS.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <label
                  htmlFor={`footer-${key}`}
                  className="text-xs text-gray-400 uppercase tracking-wide"
                >
                  {label}
                </label>
                <Input
                  id={`footer-${key}`}
                  type="url"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => {
                    setDirty(true);
                    setForm((prev) => ({ ...prev, [key]: e.target.value }));
                  }}
                  className="border-white/10 bg-black text-white placeholder:text-gray-600"
                />
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-white text-black hover:bg-gray-200"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save footer links
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
