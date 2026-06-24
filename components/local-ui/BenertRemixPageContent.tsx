"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BenertRemixNavbar from "@/components/local-ui/BenertRemixNavbar";

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0 hrs 0 min 0 sec";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const remainderAfterDays = totalSeconds % (24 * 3600);
  const hours = Math.floor(remainderAfterDays / 3600);
  const minutes = Math.floor((remainderAfterDays % 3600) / 60);
  const seconds = remainderAfterDays % 60;

  if (days >= 1) {
    return `${days} day${days > 1 ? "s" : ""} ${hours} hrs ${minutes} min ${seconds} sec`;
  }

  return `${hours} hrs ${minutes} min ${seconds} sec`;
}

type BenertRemixPageContentProps = {
  /** Used for sign-in / sign-out redirects (e.g. `/benert-remix` or `/benert-remix/result`) */
  callbackBasePath: string;
};

const BENERT_REMIX_ENDED_PATH = "/benert-remix/result";

export default function BenertRemixPageContent({
  callbackBasePath,
}: BenertRemixPageContentProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [competition, setCompetition] = useState<{
    active: boolean;
    endsAt: string | null;
  } | null>(null);
  const [userStatus, setUserStatus] = useState<{
    hasUploaded: boolean;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [releaseName, setReleaseName] = useState("");

  const fetchCompetition = useCallback(async () => {
    const res = await fetch("/api/benert-remix/competition");
    if (!res.ok) return;
    const data = await res.json();
    setCompetition({ active: data.active, endsAt: data.endsAt });
  }, []);

  const fetchUserStatus = useCallback(async () => {
    if (status !== "authenticated") return;
    const res = await fetch("/api/benert-remix/status");
    if (!res.ok) {
      setUserStatus({ hasUploaded: false });
      return;
    }
    const data = await res.json();
    setUserStatus({ hasUploaded: data.hasUploaded });
  }, [status]);

  useEffect(() => {
    fetchCompetition();
  }, [fetchCompetition]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchUserStatus();
    } else {
      setUserStatus(null);
    }
  }, [status, fetchUserStatus]);

  // While a competition is live, poll more often so we pick up the exact moment it ends; otherwise keep slower polling
  useEffect(() => {
    const ms = competition?.active ? 2000 : 5000;
    const interval = setInterval(fetchCompetition, ms);
    return () => clearInterval(interval);
  }, [competition?.active, fetchCompetition]);

  // When the competition is over, everyone (including people who already submitted) goes to
  // /benert-remix/result. While the competition is still running, submitters only see the message on this page.
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (!competition?.endsAt || competition.active || redirectedRef.current) return;
    redirectedRef.current = true; // redirect once, not on every 2s poll tick
    router.replace(BENERT_REMIX_ENDED_PATH);
  }, [competition, router]);

  useEffect(() => {
    if (!competition?.active || !competition.endsAt || userStatus?.hasUploaded) return;
    const endsAt = new Date(competition.endsAt).getTime();
    const update = () => {
      const now = Date.now();
      setCountdownMs(Math.max(0, endsAt - now));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [competition?.active, competition?.endsAt, userStatus?.hasUploaded]);

  const handleDownload = () => {
    if (!session?.user) {
      signIn("google", { callbackUrl: callbackBasePath });
      return;
    }
    const a = document.createElement("a");
    a.href = "https://osrecord.s3.us-east-1.amazonaws.com/bsk-stems.zip";
    a.download = "bsk-stem.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleUpload = async () => {
    if (!selectedFile || !session?.user) return;
    if (!releaseName.trim()) {
      setUploadError("Please enter the name of your release (which song you remixed).");
      return;
    }
    const allowed = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp3", "audio/m4a", "audio/x-m4a"];
    if (!allowed.includes(selectedFile.type) && !selectedFile.name.match(/\.(mp3|wav|m4a)$/i)) {
      setUploadError("Please select an audio file (MP3, WAV, or M4A).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const validateRes = await fetch("/api/benert-remix/upload-url", { method: "POST" });
      if (!validateRes.ok) {
        const err = await validateRes.json();
        setUploadError(err.error || "Cannot upload");
        setUploading(false);
        return;
      }
      const timestamp = Date.now();
      const safeName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const audioFileName = `benert-remix/audio/${timestamp}-${safeName}`;
      const resUrl = await fetch("/api/upload/presigned-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioFileName,
          audioFileType: selectedFile.type,
        }),
      });
      if (!resUrl.ok) {
        const err = await resUrl.json();
        setUploadError(err.error || "Failed to get upload URL");
        setUploading(false);
        return;
      }
      const { audio } = await resUrl.json();
      const uploadURL = audio.uploadURL;
      const fileURL = audio.fileURL;
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: selectedFile,
        headers: { "Content-Type": selectedFile.type },
      });
      if (!putRes.ok) {
        setUploadError("Failed to upload file");
        setUploading(false);
        return;
      }
      const completeRes = await fetch("/api/benert-remix/upload-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileURL, releaseName: releaseName.trim() }),
      });
      if (!completeRes.ok) {
        setUploadError("Failed to save submission");
        setUploading(false);
        return;
      }
      setSelectedFile(null);
      setReleaseName("");
      await fetchUserStatus();
    } finally {
      setUploading(false);
    }
  };

  const hasSubmitted = userStatus?.hasUploaded ?? false;
  const showTimerAndUpload = competition?.active && !hasSubmitted && session?.user;

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white flex flex-col font-[family-name:var(--font-inter)]">
      <BenertRemixNavbar authCallbackPath={callbackBasePath} />

      <section className="flex flex-col lg:flex-row flex-1 min-h-0 w-full overflow-hidden">
        <div className="flex-1 overflow-y-auto flex flex-col px-4 md:px-8 lg:px-12 xl:px-[10%] py-8 lg:py-12 order-2 lg:order-1">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tighter text-white mb-2">
            Welcome to the competition
          </h1>
          <p className="text-white/70 text-sm max-w-lg mb-8">
            Each contestant can upload one remix of one song from the Benert EP. Name your release after the song you remixed and watch the email you sign up with for updates.
          </p>

          <div className="max-w-lg mb-6 p-5 rounded-xl bg-white/5 border border-white/10">
            <h2 className="text-sm font-semibold text-white mb-2.5 uppercase tracking-wider">
              Competition rules
            </h2>
            <p className="text-sm text-white/75 leading-relaxed mb-2">
              Each contestant can only upload one remix of one of the songs from the Benert EP. Make sure to name the song after which song you remixed. Keep an eye out through the Google email you sign up with for updates about the competition.
            </p>
          </div>

          <div className="max-w-lg mb-8 p-5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <h2 className="text-sm font-semibold text-rose-200 mb-2 uppercase tracking-wider">
              Competition rewards
            </h2>
            <p className="text-sm text-white/85 leading-relaxed mb-2">
              If your song gets chosen as one of the five winners for the remix you chose, you will be awarded:
            </p>
            <ul className="text-sm text-white/80 leading-relaxed space-y-1 list-disc list-inside mb-2">
              <li>£100</li>
              <li>The song coming out on all platforms</li>
              <li>A physical limited edition signed vinyl of the songs including the remixes</li>
              <li>A limited Benert EP T-shirt</li>
            </ul>
            <p className="text-sm text-white/70 italic">Thank you for your time and effort.</p>
          </div>

          <h2 className="text-base md:text-lg font-medium text-white/90 mb-2">
            How it works
          </h2>
          <p className="text-sm text-white/60 max-w-lg mb-6 leading-relaxed">
            Download the STEM file below. When the competition starts, a timer will appear and you can upload your remix. You must upload before the timer ends, and you can only upload once.
          </p>

          {!hasSubmitted && (
            <div className="space-y-4 max-w-md">
              <Button
                className="w-full sm:w-auto bg-rose-500 hover:bg-rose-600 text-white rounded-lg px-6 py-3 text-sm font-medium uppercase tracking-wider"
                onClick={handleDownload}
              >
                {session?.user ? "Download STEM" : "Download STEM"}
              </Button>
              {!session?.user && (
                <p className="text-xs text-white/50">
                  Sign in with Google to download the STEM file and submit your remix.
                </p>
              )}

              {showTimerAndUpload && (
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div>
                    <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Time remaining</p>
                    <p className="text-2xl md:text-3xl font-mono tabular-nums text-rose-400">
                      {countdownMs !== null ? formatCountdown(countdownMs) : "00:00:00"}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="release-name" className="block text-sm font-medium text-white/80 mb-1.5">
                        Name of the release <span className="text-rose-400">*</span>
                      </label>
                      <Input
                        id="release-name"
                        type="text"
                        placeholder="e.g. Song Name (Remix)"
                        value={releaseName}
                        onChange={(e) => {
                          setReleaseName(e.target.value);
                          setUploadError(null);
                        }}
                        className="bg-white/10 border-white/20 text-white placeholder:text-white/40 rounded-lg"
                      />
                      <p className="text-xs text-white/50 mt-1">Name your remix after the Benert EP track you remixed.</p>
                    </div>
                    <Input
                      id="remix-file"
                      name="remix-file"
                      type="file"
                      accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp3,audio/m4a,audio/x-m4a,.mp3,.wav,.m4a"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setSelectedFile(f ?? null);
                        setUploadError(null);
                      }}
                      className="cursor-pointer text-white/80 file:mr-2 file:rounded file:border-0 file:bg-rose-500/20 file:px-3 file:py-1.5 file:text-rose-400"
                    />
                    {uploadError && (
                      <p className="text-sm text-rose-400">{uploadError}</p>
                    )}
                    <Button
                      className="w-full sm:w-auto bg-rose-500 hover:bg-rose-600 text-white rounded-lg px-6 py-3 text-sm font-medium uppercase tracking-wider"
                      onClick={handleUpload}
                      disabled={!releaseName.trim() || !selectedFile || uploading}
                    >
                      {uploading ? "Uploading..." : "Upload remix"}
                    </Button>
                  </div>
                </div>
              )}

              {competition?.active && !session?.user && (
                <p className="text-xs text-white/50 pt-2">
                  Sign in to upload your remix before the timer ends.
                </p>
              )}

              {!competition?.active && session?.user && (
                <p className="text-xs text-white/50 pt-2">
                  Competition has not started yet. Check back later to upload your remix.
                </p>
              )}
            </div>
          )}

          {hasSubmitted && (competition === null || competition.active) && (
            <p className="text-rose-400 text-lg">
              You&apos;ve submitted your remix. Thank you!
            </p>
          )}
        </div>

        <div className="w-full lg:w-[40%] lg:min-w-[40%] flex-shrink-0 flex items-center justify-center lg:justify-end order-1 lg:order-2 pt-6 lg:pt-0">
          <div className="relative w-full max-w-md lg:max-w-none aspect-[4/5] lg:aspect-auto lg:h-full min-h-[320px] lg:min-h-0">
            <Image
              src="/BENERT.png"
              alt="Benert Remix"
              fill
              className="object-contain object-center"
              sizes="(max-width: 1024px) 100vw, 40vw"
              priority
            />
          </div>
        </div>
      </section>
    </div>
  );
}
