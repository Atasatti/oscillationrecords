"use client";

import Image from "next/image";
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface UpcomingRelease {
  id: string;
  name: string;
  type: "single" | "ep" | "album";
  image: string;
  releaseDate: string;
  preSmartLinkUrl?: string | null;
  primaryArtist?: string | null;
  featureArtist?: string | null;
  /** Resolved from linked catalogue artists (preferred over the legacy text). */
  primaryArtistName?: string | null;
  featureLine?: string | null;
}

function kindLabel(type: UpcomingRelease["type"]) {
  return type === "album" ? "Album" : type === "ep" ? "EP" : "Single";
}

function SectionHeader() {
  return (
    <div className="max-w-4xl">
      <p className="font-[family-name:var(--font-inter)] text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
        On the horizon
      </p>
      <h2 className="mt-3 text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-tighter">
        <span className="text-foreground/55">Coming Soon,</span>{" "}
        <span className="text-foreground">Upcoming Releases.</span>
      </h2>
      <p className="mt-4 max-w-2xl text-muted-foreground text-base leading-relaxed sm:mt-5 sm:text-lg md:text-xl">
        Stay tuned for what&apos;s dropping next.
      </p>
      <div
        className="mt-8 flex max-w-xl items-center gap-4 sm:mt-10 sm:gap-6"
        aria-hidden
      >
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/18 to-white/5" />
        <div className="h-2 w-2 shrink-0 rotate-45 border border-white/25 bg-background/90 shadow-[0_0_12px_rgba(255,255,255,0.08)]" />
        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-white/18 to-white/5" />
      </div>
    </div>
  );
}

function UpcomingCard({ release }: { release: UpcomingRelease }) {
  const href = release.preSmartLinkUrl?.trim();
  const dateStr = new Date(release.releaseDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const body = (
    <>
      <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-zinc-950">
        <Image
          src={release.image}
          alt={release.name}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-hover:scale-[1.045]"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]"
          aria-hidden
        />
        <div className="absolute left-3 top-3 z-10 sm:left-3.5 sm:top-3.5">
          <span className="inline-flex rounded-full border border-white/12 bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 shadow-sm backdrop-blur-md sm:text-[11px]">
            {kindLabel(release.type)}
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col gap-2 border-t border-white/[0.07] bg-gradient-to-b from-zinc-950/40 to-transparent p-4 sm:p-5">
        <div
          className="pointer-events-none absolute left-0 top-0 h-full w-px bg-gradient-to-b from-white/25 via-white/10 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
          aria-hidden
        />
        <p className="text-lg font-medium leading-snug tracking-tight text-foreground break-words hyphens-auto sm:text-[1.05rem]">
          {release.name}
        </p>
        <div className="min-h-[2.75rem] text-sm leading-snug">
          {(() => {
            const primary = (release.primaryArtistName ?? release.primaryArtist)?.trim();
            const feature = (release.featureLine ?? release.featureArtist)?.trim();
            return primary || feature ? (
              <p className="break-words hyphens-auto text-muted-foreground">
                {primary ? <span className="text-foreground/88">{primary}</span> : null}
                {primary && feature ? <span className="text-muted-foreground/75"> · </span> : null}
                {feature ? <span>feat. {feature}</span> : null}
              </p>
            ) : (
              <span className="invisible select-none" aria-hidden>
                .
              </span>
            );
          })()}
        </div>
        <p className="mt-auto text-sm text-muted-foreground">Releases {dateStr}</p>
        {href ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 shadow-sm transition-[color,background-color,border-color,box-shadow] duration-300 group-hover:border-white/20 group-hover:bg-white/[0.08] group-hover:text-white">
            Pre-save
            <span aria-hidden className="translate-x-0 transition-transform duration-300 group-hover:translate-x-0.5">
              →
            </span>
          </span>
        ) : null}
      </div>
    </>
  );

  const surfaceClass = cn(
    "relative flex h-full min-h-0 flex-col overflow-hidden rounded-[1.25rem]",
    "border border-white/[0.11] bg-zinc-950/80 ring-1 ring-inset ring-white/[0.05]",
    "shadow-[0_8px_32px_-8px_rgba(0,0,0,0.78),0_2px_10px_-2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]",
    "backdrop-blur-md transition-[transform,box-shadow,border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-hover:shadow-none",
    "group-hover:-translate-y-2 group-hover:border-white/18 group-hover:shadow-[0_24px_56px_-14px_rgba(0,0,0,0.88),0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.1)]"
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "group relative flex h-full min-h-0 min-w-0 flex-col outline-none",
          "mx-auto w-full max-w-sm sm:mx-0",
          "rounded-[1.35rem] focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <div
          className="pointer-events-none absolute -bottom-2 left-1/2 z-0 h-12 w-[82%] -translate-x-1/2 rounded-[100%] bg-black/60 blur-2xl opacity-50 transition-all duration-500 group-hover:w-[92%] group-hover:opacity-95 motion-reduce:transition-none"
          aria-hidden
        />
        <div className={cn(surfaceClass, "relative z-[1]")}>{body}</div>
      </a>
    );
  }

  return (
    <div className="group relative mx-auto flex h-full min-h-0 w-full max-w-sm flex-col sm:mx-0">
      <div
        className="pointer-events-none absolute -bottom-2 left-1/2 z-0 h-12 w-[82%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-2xl opacity-40 transition-all duration-500 group-hover:w-[92%] group-hover:opacity-80 motion-reduce:transition-none"
        aria-hidden
      />
      <div className={cn(surfaceClass, "relative z-[1]")}>{body}</div>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-9 lg:grid-cols-3 lg:gap-10 xl:grid-cols-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-[1.25rem] border border-white/[0.07] bg-zinc-950/55 shadow-lg"
        >
          <div className="aspect-square bg-gradient-to-br from-zinc-900/90 to-zinc-950" />
          <div className="space-y-3 p-5">
            <div className="h-5 w-[85%] max-w-[13rem] rounded-md bg-zinc-800/70" />
            <div className="h-4 w-[60%] rounded-md bg-zinc-800/45" />
            <div className="h-4 w-[40%] rounded-md bg-zinc-800/35" />
          </div>
        </div>
      ))}
    </div>
  );
}

type UpcomingReleasesSectionProps = {
  /** Server-rendered releases. When provided, the section renders from the
   * initial HTML and skips the client fetch (no spinner / hydration waterfall). */
  initialReleases?: UpcomingRelease[];
};

const UpcomingReleasesSection = ({
  initialReleases,
}: UpcomingReleasesSectionProps) => {
  const [releases, setReleases] = useState<UpcomingRelease[]>(
    initialReleases ?? []
  );
  const [loading, setLoading] = useState(initialReleases === undefined);

  useEffect(() => {
    // Data already in the HTML from the server — don't refetch on mount.
    if (initialReleases !== undefined) return;
    const fetchReleases = async () => {
      try {
        const response = await fetch("/api/upcoming-releases");
        if (response.ok) {
          const data = await response.json();
          setReleases(data);
        }
      } catch (error) {
        console.error("Error fetching upcoming releases:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchReleases();
  }, [initialReleases]);

  const sectionChrome = (
    <>
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_85%_60%_at_50%_14%,rgba(255,255,255,0.032),transparent_58%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.18] bg-[linear-gradient(rgba(255,255,255,0.036)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.036)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:linear-gradient(to_bottom,black_0%,black_28%,transparent_75%)]"
        aria-hidden
      />
      {/* hero-bg.svg is 2126×290 — scale to full section width so waves read complete along the x-axis; sits under copy (z-10) */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[min(420px,52vw)] w-full bg-[url('/hero-bg.svg')] bg-no-repeat bg-[length:100%_auto] bg-[position:center_40%] opacity-[0.17] invert [mask-image:linear-gradient(to_bottom,black_6%,black_58%,transparent_94%)] motion-reduce:opacity-[0.1]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-12 bg-gradient-to-b from-background via-background/35 to-transparent sm:h-16"
        aria-hidden
      />
    </>
  );

  if (loading) {
    return (
      <section className="relative isolate -mt-px overflow-hidden bg-background px-4 sm:px-6 md:px-[10%] py-14 sm:py-20 md:py-28">
        {sectionChrome}
        <div className="relative z-10 w-full">
          <SectionHeader />
          <LoadingCards />
        </div>
      </section>
    );
  }

  if (releases.length === 0) return null;

  return (
    <section className="relative isolate -mt-px overflow-hidden bg-background px-4 sm:px-6 md:px-[10%] py-14 sm:py-20 md:py-28">
      {sectionChrome}
      <div className="relative z-10 w-full">
        <SectionHeader />

        <div className="mt-10 grid grid-cols-1 gap-8 [perspective:1500px] motion-reduce:[perspective:none] sm:grid-cols-2 sm:gap-9 lg:grid-cols-3 lg:gap-10 xl:grid-cols-4">
          {releases.map((release, index) => (
            <div
              key={release.id}
              className="relative flex min-h-0 min-w-0 flex-col [transform-style:preserve-3d] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom motion-safe:fill-mode-both motion-safe:duration-500"
              style={
                { animationDelay: `${Math.min(index, 7) * 70}ms` } as React.CSSProperties
              }
            >
              <UpcomingCard release={release} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UpcomingReleasesSection;
