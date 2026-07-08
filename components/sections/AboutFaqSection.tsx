import { LABEL } from "@/lib/seo";
import { ABOUT_FAQ } from "@/lib/about-faq";

// The plain-language entity definition. Rendered as visible prose so search
// engines and AI Overviews have a clean sentence to extract and attribute to us.
// The Q&A below (ABOUT_FAQ, shared with the FAQPage schema + /llms.txt) mirrors
// this — Google requires the markup to match the visible text.
export default function AboutFaqSection() {
  return (
    <section
      aria-labelledby="about-faq-heading"
      className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20"
    >
      <p className="text-lg leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Oscillation Records</strong> is an
        independent UK record label (company no.{" "}
        <span className="tabular-nums">{LABEL.companyNumber}</span>) built on a
        simple principle: <strong className="text-foreground">put artists first</strong>.
        We sign, release and champion the artists we believe in.
      </p>

      {/* Atomic, standalone facts in plain (always-visible) text — the form search
          engines and AI assistants copy near-verbatim, and the cleanest place to
          state the negative disambiguation facts as prose rather than only schema. */}
      <div className="mt-10 border-t border-border pt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Key facts
        </h2>
        <ul className="mt-4 space-y-2 text-base leading-relaxed text-foreground">
          <li>
            Oscillation Records is an independent record label based in Manchester,
            United Kingdom.
          </li>
          <li>
            It has been releasing music since 2021 and was incorporated as Oscillation
            Records Ltd (company no.{" "}
            <span className="tabular-nums">{LABEL.companyNumber}</span>) in 2024.
          </li>
          <li>Its founder is {LABEL.founder}.</li>
          <li>
            It releases electronic music — dubstep, drum &amp; bass and house —
            alongside other genres.
          </li>
          <li>
            It is not affiliated with the band The Oscillation, with the London label
            Oscillations founded by Gabriel Prokofiev, or with any other
            similarly-named label on Discogs, Beatport or Bandcamp.
          </li>
        </ul>
      </div>

      <h2
        id="about-faq-heading"
        className="mt-14 text-2xl font-semibold tracking-tight text-foreground"
      >
        Frequently asked questions
      </h2>

      <div className="mt-6 flex flex-col gap-3">
        {ABOUT_FAQ.map((item) => (
          <details
            key={item.question}
            className="group rounded-xl border border-border bg-card px-5 py-4 transition-colors open:bg-white/[0.02]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-foreground [&::-webkit-details-marker]:hidden">
              {item.question}
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
