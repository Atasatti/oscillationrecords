import Link from "next/link";
import { getPageMedia } from "@/lib/page-media";

export default async function AboutMoreSection() {
  const { bgHero } = await getPageMedia();
  return (
    <section
      className="bg-background bg-center bg-no-repeat px-4 py-14 sm:px-6 sm:py-16 md:px-[10%] md:py-20"
      style={{ backgroundImage: `url('${bgHero}')` }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          The label
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Independent, hands-on, built around the artist
        </h2>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Oscillation Records is an independent label based in Manchester, working with artists
          around the world. We care about long-term careers, not quick wins: honest feedback, clear
          planning, and releases that are treated like real campaigns—not afterthoughts.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:mt-14 md:grid-cols-2 md:gap-8">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <h3 className="text-lg font-semibold tracking-tight sm:text-xl">What we believe</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            <li>Artists should keep creative control and understand how their music is released.</li>
            <li>Marketing and storytelling should match the music, not generic industry templates.</li>
            <li>Small teams can move faster than bloated label structures—without cutting corners.</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <h3 className="text-lg font-semibold tracking-tight sm:text-xl">What we help with</h3>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
            <li>Release planning, timelines, and rollout across streaming platforms.</li>
            <li>Art direction, cover art, and consistent visual identity across singles and projects.</li>
            <li>Campaign messaging, social content angles, and growing a real listener base.</li>
            <li>Honest A&amp;R-style feedback so each track lands as strongly as it can.</li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-8 text-center sm:mt-14 sm:px-8 sm:py-10">
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
          Whether you are dropping your first single or building toward an EP or album, we work like
          partners in the room with you—not a distant corporate machine. If that sounds like your
          kind of label, we would love to hear what you are working on.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="rounded-full border border-white bg-white px-5 py-2 text-xs font-semibold uppercase tracking-wide text-black transition hover:bg-white/90"
          >
            Get in touch
          </Link>
          <Link
            href="/releases"
            className="rounded-full border border-white/25 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/45"
          >
            Hear our releases
          </Link>
        </div>
      </div>
    </section>
  );
}
