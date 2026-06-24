"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useMusic } from "@/contexts/music-context";
import { Play, Pause, X } from "lucide-react";
import ExplicitBadge from "./ExplicitBadge";

export function MusicPlayer() {
  const { currentSong, isPlaying, currentTime, duration, pauseSong, resumeSong, closeSong, seek } = useMusic();
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !progressBarRef.current || !duration) return;
      
      const rect = progressBarRef.current.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = percent * duration;
      seek(time);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, duration, seek]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return; // Don't seek if we just finished dragging
    if (!duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * duration;
    seek(time);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    if (!duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = percent * duration;
    seek(time);
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const formatTime = (time: number) => {
    if (!time || !isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!currentSong) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 player-slide-up z-50">
      <div className="bg-gradient-to-r from-[#0a0a0a] via-[#1a1a1a] to-[#0a0a0a] border-t border-[#dc2626]/20 backdrop-blur-lg shadow-2xl">
        {/* Progress bar top accent line */}
        <div className="h-1 bg-gradient-to-r from-transparent via-[#dc2626] to-transparent" />

        <div className="flex items-center justify-between px-6 py-3 gap-6">
          {/* Left: Song Info - Premium style with image emphasis */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative h-12 w-12 rounded-md overflow-hidden flex-shrink-0 shadow-xl border border-[#dc2626]/30 bg-[#1a1a1a]">
              <Image
                src={currentSong.image || "/placeholder.svg"}
                alt={currentSong.title}
                fill
                sizes="48px"
                className="object-cover"
              />
              <div className="absolute inset-0 rounded-md shadow-inner border border-[#dc2626]/10" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-white font-medium text-sm truncate leading-tight min-w-0">
                  {currentSong.title}
                </p>
                {currentSong.isExplicit ? (
                  <ExplicitBadge size="md" className="flex-shrink-0" />
                ) : null}
              </div>
              <p className="text-gray-500 text-xs truncate leading-tight mt-0.5">{currentSong.artist}</p>
            </div>
          </div>

          {/* Middle: Controls & Progress - Centered and spacious */}
          <div className="flex flex-col items-center gap-2 flex-1 max-w-md">
            {/* Play/Pause button with glow effect */}
            <button
              onClick={isPlaying ? pauseSong : resumeSong}
              className="h-9 w-9 rounded-full bg-[#dc2626] hover:bg-[#ef4444] active:bg-[#991b1b] flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-[0_0_20px_rgba(220,38,38,0.4)] active:scale-95"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-white fill-white" />
              ) : (
                <Play className="w-4 h-4 text-white fill-white ml-0.5" />
              )}
            </button>

            {/* Progress Bar - Enhanced with better visual feedback */}
            <div className="w-full relative group">
              <div
                ref={progressBarRef}
                role="slider"
                tabIndex={0}
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.floor(duration) || 0}
                aria-valuenow={Math.floor(currentTime) || 0}
                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                onKeyDown={(e) => {
                  if (!duration) return;
                  if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                    e.preventDefault();
                    seek(Math.min(currentTime + 5, duration));
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                    e.preventDefault();
                    seek(Math.max(currentTime - 5, 0));
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    seek(0);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    seek(duration);
                  }
                }}
                className="relative h-1.5 bg-[#262626] rounded-full cursor-pointer transition-all hover:h-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
                onClick={handleProgressClick}
                onMouseDown={handleMouseDown}
              >
                {/* Background track */}
                <div className="absolute inset-0 rounded-full" />

                {/* Played portion with glow */}
                <div
                  className="h-full bg-gradient-to-r from-[#dc2626] to-[#ef4444] rounded-full transition-all shadow-lg shadow-[#dc2626]/50"
                  style={{ width: `${progressPercent}%`, transition: isDragging ? 'none' : 'width 0.1s linear' }}
                />

                {/* Draggable handle */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-lg transition-all cursor-grab active:cursor-grabbing ${
                    isDragging 
                      ? 'w-4 h-4 bg-[#ef4444] opacity-100' 
                      : 'w-3 h-3 bg-[#dc2626] opacity-0 group-hover:opacity-100'
                  }`}
                  style={{ left: `calc(${progressPercent}% - ${isDragging ? '8px' : '6px'})` }}
                />
              </div>
            </div>

            {/* Time Display - Refined typography */}
            <div className="text-xs text-gray-600 w-full flex justify-between font-medium">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Right: Close Button - Subtle and refined */}
          <div className="flex-1 flex justify-end">
            <button
              onClick={closeSong}
              className="h-8 w-8 rounded-full hover:bg-[#262626] flex items-center justify-center transition-all duration-200 text-gray-500 hover:text-white hover:shadow-lg"
              aria-label="Close player"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

