"use client";

import React, { createContext, useContext, useState, useRef, useEffect } from "react";

interface Song {
  id: string;
  title: string;
  artist: string;
  image?: string | null;
  audio: string;
  duration?: number;
  /** Parental advisory — shown in the player UI */
  isExplicit?: boolean;
  /** Release type — used for analytics (single | ep | album) */
  releaseType?: string;
}

interface MusicContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playSong: (song: Song) => void;
  pauseSong: () => void;
  resumeSong: () => void;
  closeSong: () => void;
  seek: (time: number) => void;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Tracks the DB id of the currently active play event so we can update it later
  const currentPlayEventIdRef = useRef<string | null>(null);

  // Creates a new play event at song start and stores its ID
  const trackPlay = async (song: Song): Promise<void> => {
    try {
      const artistName = typeof song.artist === 'string' ? song.artist : song.artist || 'Unknown Artist';
      const response = await fetch("/api/analytics/track-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Audio plays are always a track play (contentId is the track id).
          // The release *kind* (single/ep/album) is NOT the content type — using
          // it split one track across rows and made the content drill-down
          // (which queries type=track) report zero plays.
          contentType: "track",
          contentId: song.id,
          contentName: song.title,
          artistId: null,
          artistName: artistName,
          playDuration: null,
          completed: false,
        }),
      });
      const data = await response.json();
      currentPlayEventIdRef.current = data.playEvent?.id ?? null;
    } catch (error) {
      console.error("Error tracking play:", error);
    }
  };

  // Updates the active play event with final status — called on end, skip, or close
  const finalizeCurrentPlay = (completed: boolean, overrideDuration?: number) => {
    const eventId = currentPlayEventIdRef.current;
    if (!eventId) return;
    currentPlayEventIdRef.current = null;

    const elapsed = overrideDuration ?? (audioRef.current ? Math.floor(audioRef.current.currentTime) : 0);
    fetch(`/api/analytics/play-event/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed, playDuration: elapsed > 0 ? elapsed : null }),
    }).catch(console.error);
  };

  useEffect(() => {
    // Create audio element
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = "auto";
      audioRef.current.crossOrigin = "anonymous";
    }

    const audio = audioRef.current;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      // Use the full track duration (currentTime resets to 0 on ended)
      const fullDuration = audioRef.current ? Math.floor(audioRef.current.duration || 0) : 0;
      finalizeCurrentPlay(true, fullDuration);
    };
    const handleCanPlay = () => {
      // Audio is ready to play
      if (isPlaying && audio.paused) {
        audio.play().catch(console.error);
      }
    };

    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("canplaythrough", handleCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", updateTime);
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("canplaythrough", handleCanPlay);
    };
  }, [isPlaying, currentSong]);

  useEffect(() => {
    if (audioRef.current && currentSong) {
      audioRef.current.src = currentSong.audio;
      audioRef.current.load();
    }
  }, [currentSong]);

  const playSong = async (song: Song) => {
    if (!audioRef.current) return;

    if (currentSong?.id === song.id && audioRef.current.paused) {
      // Resume if same song
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error("Error playing audio:", error);
      }
    } else {
      // Finalize the previous song as incomplete before switching
      finalizeCurrentPlay(false);

      // Play new song
      setCurrentSong(song);
      setCurrentTime(0);
      setIsPlaying(false);

      // Set source and try to play immediately
      audioRef.current.src = song.audio;
      audioRef.current.load();

      // Track play event — stores event ID for later finalization
      trackPlay(song);
      
      // Try to play immediately - browser will buffer if needed
      const attemptPlay = async () => {
        if (!audioRef.current) return;
        
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch {
          // If immediate play fails (buffering / autoplay policy), play once the
          // audio is ready. Guard with a flag so that canplay AND canplaythrough
          // firing don't both call play() — that triggers "play() interrupted by
          // a new load request" errors and play/pause flicker.
          let started = false;
          const playWhenReady = () => {
            if (started || !audioRef.current) return;
            started = true;
            audioRef.current
              .play()
              .then(() => setIsPlaying(true))
              .catch((err) => {
                console.error("Error playing audio:", err);
                setIsPlaying(false);
              });
          };
          audioRef.current.addEventListener("canplay", playWhenReady, { once: true });
          audioRef.current.addEventListener("canplaythrough", playWhenReady, { once: true });
        }
      };

      // Try to play immediately
      attemptPlay();
    }
  };

  const pauseSong = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const resumeSong = () => {
    if (audioRef.current) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((error) => {
          // Don't show "playing" if the play() promise rejects (e.g. autoplay
          // policy after a reload) — that left the UI silent with a pause icon.
          console.error("Error resuming audio:", error);
          setIsPlaying(false);
        });
    }
  };

  const closeSong = () => {
    finalizeCurrentPlay(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setCurrentSong(null);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  return (
    <MusicContext.Provider
      value={{
        currentSong,
        isPlaying,
        currentTime,
        duration,
        playSong,
        pauseSong,
        resumeSong,
        closeSong,
        seek,
      }}
    >
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  const context = useContext(MusicContext);
  if (context === undefined) {
    throw new Error("useMusic must be used within a MusicProvider");
  }
  return context;
}

