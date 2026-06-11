"use client";
import React, { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AdminNavbar from "@/components/local-ui/AdminNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Image as ImageIcon, Loader2 } from "lucide-react";

export default function EditArtist() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.artistId as string;
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    biography: "",
    profilePicture: "",
    profilePictureFile: null as File | null,
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
  });

  useEffect(() => {
    const fetchArtist = async () => {
      try {
        const response = await fetch(`/api/artists/${artistId}`);
        if (!response.ok) throw new Error("Failed to fetch artist");
        const data = await response.json();
        setFormData((prev) => ({
          ...prev,
          name: data.name || "",
          biography: data.biography || "",
          profilePicture: data.profilePicture || "",
          xLink: data.xLink || "",
          tiktokLink: data.tiktokLink || "",
          spotifyLink: data.spotifyLink || "",
          instagramLink: data.instagramLink || "",
          youtubeLink: data.youtubeLink || "",
          facebookLink: data.facebookLink || "",
          appleMusicLink: data.appleMusicLink || "",
          tidalLink: data.tidalLink || "",
          amazonMusicLink: data.amazonMusicLink || "",
          soundcloudLink: data.soundcloudLink || "",
        }));
        if (data.profilePicture) setImagePreview(data.profilePicture);
      } catch (error) {
        console.error(error);
        alert("Failed to load artist");
        router.push("/admin/catalog");
      } finally {
        setIsFetching(false);
      }
    };
    fetchArtist();
  }, [artistId, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getPresignedUrl = async (imageFile: File) => {
    const timestamp = Date.now();
    const imageFileName = `artists/images/${timestamp}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const response = await fetch("/api/upload/presigned-url-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageFileName, imageFileType: imageFile.type }),
    });
    if (!response.ok) throw new Error("Failed to get presigned URL");
    return response.json() as Promise<{ uploadURL: string; fileURL: string }>;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormData((prev) => ({ ...prev, profilePictureFile: file }));
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      let profilePicture = formData.profilePicture;
      if (formData.profilePictureFile) {
        setUploadingImage(true);
        const presigned = await getPresignedUrl(formData.profilePictureFile);
        await fetch(presigned.uploadURL, {
          method: "PUT",
          body: formData.profilePictureFile,
          headers: { "Content-Type": formData.profilePictureFile.type },
        });
        profilePicture = presigned.fileURL;
        setUploadingImage(false);
      }

      const response = await fetch(`/api/artists/${artistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          biography: formData.biography,
          profilePicture,
          xLink: formData.xLink,
          tiktokLink: formData.tiktokLink,
          spotifyLink: formData.spotifyLink,
          instagramLink: formData.instagramLink,
          youtubeLink: formData.youtubeLink,
          facebookLink: formData.facebookLink,
          appleMusicLink: formData.appleMusicLink,
          tidalLink: formData.tidalLink,
          amazonMusicLink: formData.amazonMusicLink,
          soundcloudLink: formData.soundcloudLink,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update artist");
      }
      router.push("/admin/catalog");
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to update artist");
    } finally {
      setUploadingImage(false);
      setIsLoading(false);
    }
  };

  if (isFetching) {
    return (
      <div className="min-h-screen text-white">
        <AdminNavbar />
        <div className="flex justify-center py-24">
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AdminNavbar />
      <div className="px-[10%] py-14 pb-40">
        <Button variant="ghost" onClick={() => router.back()} className="mb-4 text-gray-400 hover:text-white">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-4xl font-light tracking-tighter">Edit Artist</h1>
        <p className="text-gray-400 mt-2 mb-8">Update artist details</p>

        <form onSubmit={handleSubmit} className="max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 bg-[#141414] rounded-xl p-6 border border-white/10">
              <label className="block text-sm font-medium text-gray-300 mb-4">Profile Picture</label>
              <div className="space-y-4">
                {imagePreview ? (
                  <img src={imagePreview} alt="Profile preview" className="w-full aspect-square object-cover rounded-lg border border-white/10" />
                ) : null}
                <input ref={imageInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                <Button type="button" onClick={() => imageInputRef.current?.click()} variant="outline" className="w-full border-white/10 text-gray-300">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  {imagePreview ? "Replace Image" : "Choose Image"}
                </Button>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#141414] rounded-xl p-6 border border-white/10 space-y-4">
                <Input name="name" value={formData.name} onChange={handleInputChange} required placeholder="Artist name" className="bg-[#141414] border-white/10 text-white" />
                <Textarea name="biography" value={formData.biography} onChange={handleInputChange} required rows={5} placeholder="Biography" className="bg-[#141414] border-white/10 text-white" />
              </div>
              <div className="bg-[#141414] rounded-xl p-6 border border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input name="xLink" value={formData.xLink} onChange={handleInputChange} placeholder="X link" className="bg-black/40 border-white/10 text-white" />
                <Input name="tiktokLink" value={formData.tiktokLink} onChange={handleInputChange} placeholder="TikTok link" className="bg-black/40 border-white/10 text-white" />
                <Input name="spotifyLink" value={formData.spotifyLink} onChange={handleInputChange} placeholder="Spotify link" className="bg-black/40 border-white/10 text-white" />
                <Input name="instagramLink" value={formData.instagramLink} onChange={handleInputChange} placeholder="Instagram link" className="bg-black/40 border-white/10 text-white" />
                <Input name="youtubeLink" value={formData.youtubeLink} onChange={handleInputChange} placeholder="YouTube link" className="bg-black/40 border-white/10 text-white" />
                <Input name="facebookLink" value={formData.facebookLink} onChange={handleInputChange} placeholder="Facebook link" className="bg-black/40 border-white/10 text-white" />
                <Input name="appleMusicLink" value={formData.appleMusicLink} onChange={handleInputChange} placeholder="Apple Music link" className="bg-black/40 border-white/10 text-white" />
                <Input name="tidalLink" value={formData.tidalLink} onChange={handleInputChange} placeholder="Tidal link" className="bg-black/40 border-white/10 text-white" />
                <Input name="amazonMusicLink" value={formData.amazonMusicLink} onChange={handleInputChange} placeholder="Amazon Music link" className="bg-black/40 border-white/10 text-white" />
                <Input name="soundcloudLink" value={formData.soundcloudLink} onChange={handleInputChange} placeholder="SoundCloud link" className="bg-black/40 border-white/10 text-white" />
              </div>
              <Button type="submit" disabled={isLoading || uploadingImage} className="bg-white text-black hover:bg-gray-200">
                {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadingImage ? "Uploading..." : "Saving..."}</> : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
