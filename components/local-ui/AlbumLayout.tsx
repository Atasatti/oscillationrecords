"use client";

import Image from "next/image";
import { usePageMedia } from "@/hooks/use-page-media";

export default function AlbumLayout() {
  // Admin-editable collage (Site content → Contact). First five = left column,
  // the rest = right column; falls back to the built-in artwork.
  const { contactArtworks } = usePageMedia();
  const leftColumn = contactArtworks.slice(0, 5);
  const rightColumn = contactArtworks.slice(5);

  return (
    <div className="h-screen p-6 overflow-hidden w-4/10">
      <div className="h-full max-w-4xl mx-auto -mt-32">
        <div className="grid grid-cols-2 gap-6 h-full">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {leftColumn.map((image, i) => (
              <div
                key={`${image}-${i}`}
                className="relative rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
              >
                <Image
                  src={image}
                  alt={`Artwork ${i + 1}`}
                  width={250}
                  height={400}
                  className="w-full h-auto object-cover"
                  unoptimized={image.startsWith("/")}
                />
              </div>
            ))}
          </div>

          {/* Right Column - Offset downward */}
          <div className="flex flex-col gap-6 pt-20">
            {rightColumn.map((image, i) => (
              <div
                key={`${image}-${i}`}
                className="relative rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300"
              >
                <Image
                  src={image}
                  alt={`Artwork ${leftColumn.length + i + 1}`}
                  width={250}
                  height={400}
                  className="w-full h-auto object-cover"
                  unoptimized={image.startsWith("/")}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
