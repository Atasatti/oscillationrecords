"use client";
import React, { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Music, Image as ImageIcon, Loader2 } from "lucide-react";
import { useToast } from "@/components/local-ui/Toast";

export default function CreateSingle() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.artistId as string;
  const toast = useToast();
  
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [calculatingDuration, setCalculatingDuration] = useState(false);
  const [imageError, setImageError] = useState<string>("");
  const [nameError, setNameError] = useState<string>("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    imageFile: null as File | null,
    audioFile: null as File | null,
  });
  
  const [audioDuration, setAudioDuration] = useState<number>(0);
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (name === "name") setNameError("");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'image') {
      setFormData(prev => ({ ...prev, imageFile: file }));
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
      setImageError(""); // Clear any previous error
    } else {
      setFormData(prev => ({ ...prev, audioFile: file }));
      setCalculatingDuration(true);
      
      // Calculate audio duration
      const audio = new Audio();
      const audioUrl = URL.createObjectURL(file);
      audio.src = audioUrl;
      
      try {
        await new Promise<void>((resolve, reject) => {
          audio.onloadedmetadata = () => {
            setAudioDuration(Math.floor(audio.duration));
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
        setCalculatingDuration(false);
      }
    }
  };

  const removeImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setFormData(prev => ({ ...prev, imageFile: null }));
    setImageError(""); // Clear error when removing image
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

  const getPresignedUrls = async (audioFile: File, imageFile: File | null) => {
    // Generate unique filenames
    const timestamp = Date.now();
    const audioFileName = `singles/audio/${timestamp}-${audioFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const imageFileName = imageFile ? `singles/images/${timestamp}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}` : null;
    
    // Get presigned URLs for both files in one API call
    const response = await fetch('/api/upload/presigned-urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioFileName,
        audioFileType: audioFile.type,
        imageFileName: imageFileName,
        imageFileType: imageFile?.type || null,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to get presigned URLs');
    }

    const data = await response.json();
    return {
      audio: data.audio,
      image: data.image || null,
    };
  };

  const uploadFileToS3 = async (file: File, uploadURL: string, type: 'image' | 'audio'): Promise<string> => {
    // Upload file to S3 using presigned URL
    // The presigned URL already includes Content-Type in the signature
    // We must send the exact Content-Type that was signed
    const uploadResponse = await fetch(uploadURL, {
      method: "PUT",
      body: file, // Use File directly - browser will handle it correctly
      headers: {
        'Content-Type': file.type, // Must match what was signed
      },
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error(`Upload failed for ${type}:`, errorText);
      console.error(`Response status:`, uploadResponse.status);
      console.error(`File type:`, file.type);
      console.error(`File size:`, file.size);
      throw new Error(`Failed to upload ${type} file to S3: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    console.log(`${type} uploaded successfully`);
    return uploadURL;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Required-field validation — name and cover both surface inline.
    let invalid = false;
    if (!formData.name?.trim()) {
      setNameError("Please enter a single name");
      invalid = true;
    } else {
      setNameError("");
    }
    if (!formData.imageFile) {
      setImageError("Cover image is required");
      invalid = true;
    } else {
      setImageError("");
    }
    if (invalid) {
      setIsLoading(false);
      return;
    }
    if (!formData.imageFile) return; // narrows type for the upload below

    if (!formData.audioFile) {
      toast.error("Please select an audio file");
      return;
    }

    if (audioDuration === 0) {
      toast.error("Please wait for the audio duration to be calculated");
      return;
    }

    setIsLoading(true);
    setImageError("");

    try {
      // Step 1: Get presigned URLs for both files in one API call
      console.log("Getting presigned URLs...");
      
      const presignedUrls = await getPresignedUrls(formData.audioFile, formData.imageFile);
      const audioPresigned = presignedUrls.audio;
      const imagePresigned = presignedUrls.image;

      console.log("Presigned URLs obtained:", { 
        audio: audioPresigned.fileURL, 
        image: imagePresigned?.fileURL 
      });

      // Step 2: Upload both files to S3
      setUploadingImage(true);
      setUploadingAudio(true);

      const uploadPromises: Promise<string | null>[] = [];

      // Upload audio (required)
      uploadPromises.push(
        uploadFileToS3(
          formData.audioFile,
          audioPresigned.uploadURL,
          'audio'
        ).then(() => audioPresigned.fileURL)
      );

      // Upload image (required)
      if (!imagePresigned) {
        throw new Error("Failed to get presigned URL for image");
      }
      uploadPromises.push(
        uploadFileToS3(
          formData.imageFile!,
          imagePresigned.uploadURL,
          'image'
        ).then(() => imagePresigned.fileURL)
      );

      // Upload both files (in parallel)
      const uploadedUrls = await Promise.all(uploadPromises);
      const audioUrl = uploadedUrls[0] as string;
      const imageUrl = uploadedUrls[1] as string;

      console.log("Files uploaded:", { audioUrl, imageUrl });

      setUploadingImage(false);
      setUploadingAudio(false);

      // Step 3: Create single record
      const response = await fetch(`/api/artists/${artistId}/singles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          image: imageUrl,
          audioFile: audioUrl,
          duration: audioDuration,
        }),
      });

      if (response.ok) {
        router.push(`/admin/catalog/artist/${artistId}`);
      } else {
        const error = await response.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error("Error creating single:", error);
      toast.error(`Failed to create single: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setUploadingImage(false);
      setUploadingAudio(false);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen text-white">
            
      <div className="px-[10%] py-14">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="mb-4 text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <h1 className="text-4xl font-light tracking-tighter">Create New Single</h1>
          <p className="text-gray-400 mt-2">Add a new single release for this artist</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-w-4xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Image Upload */}
            <div className="lg:col-span-1">
              <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
                <label className="block text-sm font-medium text-gray-300 mb-4">
                  Single Image *
                </label>
                <div className="space-y-4">
                  {imagePreview ? (
                    <div className="relative group">
                      <img
                        src={imagePreview}
                        alt="Single preview"
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
                        imageError ? "border-red-500/70" : "border-gray-700"
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
                    onChange={(e) => handleFileChange(e, 'image')}
                    className="hidden"
                  />
                  {!imagePreview && (
                    <Button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      variant="outline"
                      disabled={isLoading || uploadingImage}
                      className="w-full border-gray-700 text-gray-300 hover:bg-[#1a1a1a]"
                    >
                      <ImageIcon className="w-4 h-4 mr-2" />
                      Choose Image
                    </Button>
                  )}
                  {imageError && (
                    <p className="text-xs text-red-400 text-center mt-2">
                      {imageError}
                    </p>
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
                      Single Name *
                    </label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="Enter single name"
                      aria-invalid={nameError ? true : undefined}
                      className={`bg-[#0F0F0F] text-white placeholder-gray-500 focus:border-gray-600 ${
                        nameError ? "border-red-500/70" : "border-gray-700"
                      }`}
                    />
                    {nameError && (
                      <p className="mt-1 text-sm text-red-400">{nameError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Audio Upload */}
              <div className="bg-[#0F0F0F] rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-medium text-gray-200 mb-4">Audio File *</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={(e) => handleFileChange(e, 'audio')}
                      className="hidden"
                      required
                    />
                    <Button
                      type="button"
                      onClick={() => audioInputRef.current?.click()}
                      variant="outline"
                      disabled={isLoading || uploadingAudio || calculatingDuration}
                      className="border-gray-700 text-gray-300 hover:bg-[#1a1a1a]"
                    >
                      <Music className="w-4 h-4 mr-2" />
                      Choose Audio
                    </Button>
                    {formData.audioFile && (
                      <span className="text-sm text-gray-400">
                        {formData.audioFile.name}
                      </span>
                    )}
                  </div>
                  {calculatingDuration && (
                    <p className="text-sm text-gray-400">
                      Calculating duration...
                    </p>
                  )}
                  {audioDuration > 0 && !calculatingDuration && (
                    <p className="text-sm text-gray-400">
                      Duration: {formatDuration(audioDuration)}
                    </p>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex gap-4">
              <Button
                type="submit"
                disabled={isLoading || uploadingImage || uploadingAudio || calculatingDuration}
                className="bg-white text-black hover:bg-gray-200"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {uploadingImage || uploadingAudio ? "Uploading files..." : "Creating single..."}
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Create Single
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

