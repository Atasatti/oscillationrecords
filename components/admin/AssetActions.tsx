// components/admin/AssetActions.tsx
"use client";

import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { DownloadItem } from "@/lib/asset-grouping";

// Consolidated download control for a group of assets:
//  • zipHref set (release) → primary "Download all (.zip)" button + a ⋯ menu of
//    the individual files, so admins can grab everything at once OR one file.
//  • 0 items → ⋯ menu showing a disabled "No downloads available"
//  • 1 item  → a direct Download button
//  • 2+ items → a ⋯ "Download" menu, one entry per item
export default function AssetActions({ items, zipHref }: { items: DownloadItem[]; zipHref?: string }) {
  if (zipHref) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <a
          href={zipHref}
          download
          className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-200"
        >
          <Download className="h-3.5 w-3.5" /> Download all (.zip)
        </a>
        {items.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="px-2" aria-label="Download individual files">
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-[16rem]">
              {items.map((it, i) => (
                <DropdownMenuItem key={`${it.href}-${i}`} asChild>
                  <a href={it.href} download={it.downloadName} className="truncate">
                    {it.label}
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    );
  }

  const [only] = items;
  if (items.length === 1 && only) {
    return (
      <a
        href={only.href}
        download={only.downloadName}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/5"
      >
        <Download className="h-3.5 w-3.5" /> Download
      </a>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Download <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[16rem]">
        {items.length === 0 ? (
          <DropdownMenuItem disabled>No downloads available</DropdownMenuItem>
        ) : (
          items.map((it, i) => (
            <DropdownMenuItem key={`${it.href}-${i}`} asChild>
              <a href={it.href} download={it.downloadName} className="truncate">
                {it.label}
              </a>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
