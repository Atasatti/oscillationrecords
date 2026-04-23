"use client";

import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import BenertRemixNavbar from "@/components/local-ui/BenertRemixNavbar";

const rewardItems = [
  "£100",
  "The song coming out on all platforms",
  "A physical limited edition signed vinyl of the songs including the remixes",
  "A limited Benert EP T-shirt",
];

export default function BenertRemixTestPage() {
  return (
    <div className="relative min-h-screen bg-[#0a0a0a] text-white flex flex-col font-[family-name:var(--font-inter)] overflow-x-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_10%_20%,rgba(225,29,72,0.11),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_90%_80%,rgba(50,20,30,0.45),transparent_50%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2)_0%,transparent_30%,transparent_70%,rgba(0,0,0,0.35)_100%)]" aria-hidden />

      <div className="relative z-10 flex min-h-0 min-h-screen flex-col">
        <BenertRemixNavbar authCallbackPath="/benert-remix/test" />

        <section className="flex flex-1 flex-col lg:flex-row lg:min-h-0">
          <div className="order-2 flex flex-1 flex-col justify-center px-4 py-10 sm:px-6 md:px-8 lg:order-1 lg:px-12 lg:py-12 xl:px-[10%]">
            <div className="mx-auto w-full max-w-xl space-y-8 lg:space-y-10">
              <div className="relative overflow-hidden rounded-2xl border border-rose-500/25 bg-rose-950/30 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_50px_-20px_rgba(190,18,60,0.35)] sm:p-8 md:p-9">
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-rose-500/12 blur-2xl"
                  aria-hidden
                />
                <div className="relative flex gap-4 sm:gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 ring-1 ring-rose-400/20">
                    <CheckCircle2 className="h-6 w-6 text-rose-300" strokeWidth={1.5} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-3 pt-0.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-300/80">
                      Submission received
                    </p>
                    <h1 className="text-2xl font-light leading-tight tracking-tight text-white sm:text-3xl">
                      Thank you for your participation.
                    </h1>
                    <p className="max-w-md text-sm leading-relaxed text-white/70 sm:text-[15px]">
                      We will review your submission and provide an update within the next two months.
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-500/[0.08] to-white/[0.02] p-6 shadow-lg shadow-black/20 sm:p-7">
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px min-w-[2rem] flex-1 bg-gradient-to-r from-transparent via-rose-500/25 to-rose-400/45" />
                  <h2 className="shrink-0 text-center text-xs font-semibold uppercase tracking-[0.2em] text-rose-200/90">
                    Competition rewards
                  </h2>
                  <div className="h-px min-w-[2rem] flex-1 bg-gradient-to-l from-transparent via-rose-500/25 to-rose-400/45" />
                </div>
                <p className="mb-5 text-sm leading-relaxed text-white/85 sm:text-[15px]">
                  If your song gets chosen as one of the five winners for the remix you chose, you will be
                  awarded:
                </p>
                <ul className="space-y-3">
                  {rewardItems.map((line) => (
                    <li key={line} className="flex gap-3 text-sm leading-snug text-white/80 sm:text-[15px]">
                      <span
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.45)]"
                        aria-hidden
                      />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 border-t border-white/10 pt-5 text-sm italic text-white/55">
                  Thank you for your time and effort.
                </p>
              </div>
            </div>
          </div>

          <div className="relative order-1 flex w-full flex-shrink-0 items-center justify-center border-b border-white/[0.06] bg-gradient-to-b from-rose-950/25 to-[#0a0a0a] py-8 sm:py-10 lg:order-2 lg:w-[42%] lg:min-w-[min(100%,24rem)] lg:border-b-0 lg:border-l lg:border-white/[0.06] lg:bg-gradient-to-l lg:from-[#0a0a0a] lg:via-rose-950/15 lg:to-rose-950/30 lg:py-0">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(225,29,72,0.08),transparent_70%)] lg:bg-[radial-gradient(ellipse_80%_60%_at_60%_50%,rgba(225,29,72,0.1),transparent_65%)]"
              aria-hidden
            />
            <div className="relative h-[min(55vh,420px)] w-full max-w-sm px-6 sm:h-[min(50vh,480px)] sm:max-w-md lg:h-[min(78vh,720px)] lg:max-w-none lg:px-6 xl:pr-10">
              <div className="relative h-full w-full">
                <div
                  className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-rose-500/20 via-transparent to-white/5 opacity-60 blur-xl"
                  aria-hidden
                />
                <div className="relative h-full w-full">
                  <Image
                    src="/BENERT.png"
                    alt="Benert"
                    fill
                    className="object-contain object-center drop-shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
                    sizes="(max-width: 1024px) 100vw, 42vw"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
