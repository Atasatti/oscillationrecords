"use client";
import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Music, Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

interface Song {
  name: string;
  audioFile: File | null;
  duration: number;
}

export default function CreateAlbum() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.artistId as string;
  const toast = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [calculatingDurations, setCalculatingDurations] = useState<{ [key: number]: boolean }>({});
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    coverImageFile: null as File | null,
    description: "",
    releaseDate: "",
  });
  
  const [songs, setSongs] = useState<Song[]>([
    { name: "", audioFile: null, duration: 0 }
  ]);
  const [errors, setErrors] = useState<{ name?: string; coverImage?: string; releaseDate?: string }>({});
  const clearError = (field: "name" | "coverImage" | "releaseDate") =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (name === "name" || name === "releaseDate") clearError(name);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFormData(prev => ({ ...prev, coverImageFile: file }));
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      clearError("coverImage");
    }
  };

  const removeImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setFormData(prev => ({ ...prev, coverImageFile: null }));
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleSongNameChange = (index: number, value: string) => {
    const newSongs = [...songs];
    newSongs[index].name = value;
    setSongs(newSongs);
  };

  const handleSongAudioChange = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newSongs = [...songs];
    newSongs[index].audioFile = file;
    setSongs(newSongs);

    setCalculatingDurations(prev => ({ ...prev, [index]: true }));
    
    // Calculate audio duration
    const audio = new Audio();
    const audioUrl = URL.createObjectURL(file);
    audio.src = audioUrl;
    
    try {
      await new Promise<void>((resolve, reject) => {
        audio.onloadedmetadata = () => {
          newSongs[index].duration = Math.floor(audio.duration);
          setSongs(newSongs);
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error("Failed to load audio metadata"));
        };
      });
    } catch (error) {
      console.error("Error calculating audio duration:", error);
      toast.error("Failed to calculate audio duration. Please try again.");
    } finally {
      setCalculatingDurations(prev => ({ ...prev, [index]: false }));
    }
  };

  const addSong = () => {
    setSongs([...songs, { name: "", audioFile: null, duration: 0 }]);
  };

  const removeSong = (index: number) => {
    if (songs.length > 1) {
      setSongs(songs.filter((_, i) => i !== index));
    }
  };

  const getPresignedUrls = async (coverImageFile: File, audioFiles: File[]) => {
    const timestamp = Date.now();
    const imageFileName = `albums/images/${timestamp}-${coverImageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    
    const audioFilesData = audioFiles.map((file, index) => ({
      fileName: `albums/audio/${timestamp}-${index}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`,
      fileType: file.type,
    }));

    const response = await fetch('/api/upload/presigned-urls-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageFileName,
        imageFileType: coverImageFile.type,
        audioFiles: audioFilesData,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get presigned URLs');
    }

    return await response.json();
  };

  const uploadFileToS3 = async (file: File, uploadURL: string): Promise<void> => {
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`Upload failed:`, errorText);
      console.error(`Response status:`, uploadResponse.status);
      console.error(`File type:`, file.type);
      console.error(`File size:`, file.size);
      throw new Error(`Failed to upload file to S3: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const fieldErrors: typeof errors = {};
    if (!formData.name?.trim()) fieldErrors.name = "Please enter an album name";
    if (!formData.coverImageFile) fieldErrors.coverImage = "Please add a cover image";
    if (formData.releaseDate) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      if (formData.releaseDate < todayStr) {
        fieldErrors.releaseDate = "Release date can’t be in the past";
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    // Validated above; this also narrows the type for the upload calls below.
    if (!formData.coverImageFile) return;

    // Validate all songs
    const validSongs = songs.filter(song => song.name && song.audioFile && song.duration > 0);
    if (validSongs.length === 0) {
      toast.error("Please add at least one song with name and audio file");
      return;
    }

    // Check if all songs have duration calculated
    const songsWithDuration = songs.every(song => !song.audioFile || song.duration > 0);
    if (!songsWithDuration) {
      toast.error("Please wait for all audio durations to be calculated");
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Get presigned URLs
      const audioFiles = validSongs.map(song => song.audioFile!);
      const presignedUrls = await getPresignedUrls(formData.coverImageFile, audioFiles);
      
      // Step 2: Upload cover image
      setUploadingImage(true);
      let coverImageUrl: string;
      try {
        await uploadFileToS3(
          formData.coverImageFile,
          presignedUrls.image.uploadURL
        );
        coverImageUrl = presignedUrls.image.fileURL;
      } catch (error) {
        console.error("Error uploading cover image:", error);
        toast.error("Failed to upload cover image. Please try again.");
        setUploadingImage(false);
        setIsLoading(false);
        return;
      } finally {
        setUploadingImage(false);
      }

      // Step 3: Upload all audio files
      setUploadingAudio(true);
      const uploadedAudioUrls: string[] = [];
      try {
        await Promise.all(
          presignedUrls.audioFiles.map(async (audioData: { uploadURL: string; fileURL: string; fileName: string }, index: number) => {
            await uploadFileToS3(
              audioFiles[index],
              audioData.uploadURL
            );
            uploadedAudioUrls.push(audioData.fileURL);
          })
        );
      } catch (error) {
        console.error("Error uploading audio files:", error);
        toast.error("Failed to upload audio files. Please try again.");
        setUploadingAudio(false);
        setIsLoading(false);
        return;
      } finally {
        setUploadingAudio(false);
      }

      // Step 4: Create songs in bulk
      const songsData = validSongs.map((song, index) => ({
        name: song.name,
        audioFile: uploadedAudioUrls[index],
        duration: song.duration,
        image: coverImageUrl, // Use album cover for all songs
      }));

      const songsResponse = await fetch(`/api/artists/${artistId}/songs/bulk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ songs: songsData }),
      });

      if (!songsResponse.ok) {
        const error = await songsResponse.json();
        throw new Error(error.error || "Failed to create songs");
      }

      const createdSongs = await songsResponse.json();
      const songIds = createdSongs.map((song: { id: string }) => song.id);

      // Step 5: Create album
      const albumResponse = await fetch(`/api/artists/${artistId}/albums`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          coverImage: coverImageUrl,
          releaseDate: formData.releaseDate || null,
          description: formData.description || null,
          songIds,
        }),
      });

      if (albumResponse.ok) {
        router.push(`/admin/catalog/artist/${artistId}`);
      } else {
        const error = await albumResponse.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error creating album:", error);
      toast.error(`Failed to create album: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-white">
            
      <div className="px-[10%] py-14">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <h1 className="text-4xl font-light tracking-tighter">Create New Album</h1>
          <p className="text-gray-400 mt-2">Add a new album release for this artist</p>
        </div>

        <form onSubmit={handleSubmit} className="max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Image Upload */}
            <div className="lg:col-span-1">
              <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
                <label className="block text-sm font-medium text-gray-300 mb-4">
                  Album Cover Image *
                </label>
                <div className="space-y-4">
                  {imagePreview ? (
                    <div className="relative group">
                      <img
                        src={imagePreview}
                        alt="Cover preview"
                        className="w-full aspect-square object-cover rounded-lg border border-gray-700"
                      />
                      <Button
                        type="button"
                        onClick={removeImage}
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div
                      onClick={() => imageInputRef.current?.click()}
                      className={`w-full aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-600 transition-colors bg-[#0F0F0F]/50 ${
                        errors.coverImage ? "border-red-500/70" : "border-gray-700"
                      }`}
                    >
                      <ImageIcon className="w-12 h-12 text-gray-500 mb-3" />
                      <p className="text-sm text-gray-400 mb-1">Click to upload</p>
                      <p className="text-xs text-gray-500">or drag and drop</p>
                    </div>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  {errors.coverImage && (
                    <p className="text-sm text-red-400">{errors.coverImage}</p>
                  )}
                  {!imagePreview && (
                    <Button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      variant="outline"
                      disabled={isLoading || uploadingImage}
                      className="w-full border-gray-700 text-gray-300 hover:bg-gray-800"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Choose Cover Image
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Form Fields */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Information */}
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 space-y-6">
                <h3 className="text-lg font-medium text-gray-200 mb-4">Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                      Album Name *
                    </label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Enter album name"
                      aria-invalid={errors.name ? true : undefined}
                      className={`bg-[#0F0F0F] text-white placeholder-gray-500 focus:border-gray-600 ${
                        errors.name ? "border-red-500/70" : "border-gray-700"
                      }`}
                    />
                    {errors.name && (
                      <p className="mt-1 text-sm text-red-400">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-2">
                      Description
                    </label>
                    <Textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleInputChange}
                      placeholder="Enter album description..."
                      rows={4}
                      className="bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-gray-600 resize-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="releaseDate" className="block text-sm font-medium text-gray-300 mb-2">
                      Release Date
                    </label>
                    <Input
                      id="releaseDate"
                      name="releaseDate"
                      type="date"
                      value={formData.releaseDate}
                      onChange={handleInputChange}
                      aria-invalid={errors.releaseDate ? true : undefined}
                      className={`bg-[#0F0F0F] text-white placeholder-gray-500 focus:border-gray-600 ${
                        errors.releaseDate ? "border-red-500/70" : "border-gray-700"
                      }`}
                    />
                    {errors.releaseDate && (
                      <p className="mt-1 text-sm text-red-400">{errors.releaseDate}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Songs */}
              <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-200">Songs *</h3>
                  <Button
                    type="button"
                    onClick={addSong}
                    variant="outline"
                    size="sm"
                    className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Song
                  </Button>
                </div>

                <div className="space-y-4">
                  {songs.map((song, index) => (
                    <div key={index} className="bg-[#0F0F0F] p-4 rounded-lg space-y-3 border border-gray-700">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <Input
                          placeholder="Song name"
                          value={song.name}
                          onChange={(e) => handleSongNameChange(index, e.target.value)}
                          className="bg-[#0F0F0F] border-gray-700 text-white placeholder-gray-500 mb-3 focus:border-gray-600"
                        />
                        <div className="flex items-center gap-4">
                          <input
                            ref={(el) => { audioInputRefs.current[index] = el; }}
                            type="file"
                            accept="audio/*"
                            onChange={(e) => handleSongAudioChange(index, e)}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            onClick={() => audioInputRefs.current[index]?.click()}
                            variant="outline"
                            size="sm"
                            disabled={isLoading || uploadingAudio || calculatingDurations[index]}
                            className="border-gray-700 text-gray-300 hover:bg-[#1a1a1a]"
                          >
                            <Music className="w-4 h-4 mr-2" />
                            Choose Audio
                          </Button>
                          {song.audioFile && (
                            <span className="text-sm text-gray-400">
                              {song.audioFile.name}
                            </span>
                          )}
                          {calculatingDurations[index] && (
                            <span className="text-xs text-gray-500">Calculating duration...</span>
                          )}
                          {song.duration > 0 && !calculatingDurations[index] && (
                            <span className="text-sm text-gray-400">
                              {Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>
                      </div>
                      {songs.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => removeSong(index)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

              {/* Submit Button */}
              <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                disabled={isLoading || uploadingImage || uploadingAudio}
                className="bg-white text-black hover:bg-gray-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {uploadingImage || uploadingAudio ? "Uploading files..." : "Creating album..."}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Album
                  </>
                )}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
            </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

