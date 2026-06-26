import { LABEL } from "@/lib/seo";

// Entity-disambiguation FAQ. This content is the source of truth for BOTH the
// visible Q&A below AND the FAQPage JSON-LD on the About page (Google requires
// the markup to match on-page text), so it's exported and consumed in both
// places. The questions are deliberately phrased the way people (and AI
// Overviews) actually ask them — including the explicit "not The Oscillation"
// answer that counters the current search conflation.
//
// Keep answers factual. As the LABEL TODOs (city, founder, founding date) get
// filled in, extend the relevant answers here and they flow into the schema too.
export const ABOUT_FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "What is Oscillation Records?",
    answer:
      "Oscillation Records is an independent UK record label (company no. 15579381). We release and champion the artists we work with, with one principle at the centre of everything we do: put artists first.",
  },
  {
    question: "Is Oscillation Records the same as The Oscillation, Oscillations, or the Chilean duo?",
    answer:
      "No. Oscillation Records is a distinct UK independent record label and is not affiliated with any similarly-named act: not The Oscillation (the London psychedelic / space-rock band led by Demian Castellanos), not Oscillations (the London experimental-electronic label founded by Gabriel Prokofiev), and not the Chilean tech-house / techno duo Eban Krocker and Diego Herrera who also release as “Oscillation Records”.",
  },
  {
    question: "Where is Oscillation Records based?",
    answer:
      "Oscillation Records is based in Manchester, United Kingdom. It's a UK-registered independent record label (Companies House company no. 15579381), founded in 2022.",
  },
  {
    question: "What genre or kind of music does Oscillation Records release?",
    answer:
      "Oscillation Records is primarily an electronic label — EDM, dubstep, drum & bass and house — but we're open to all genres and release music we believe in regardless of style.",
  },
  {
    question: "Is Oscillation Records an exclusive label? Do artists have to sign to it?",
    answer:
      "No. Oscillation Records is not an exclusive label. Artists are free to release their music elsewhere, and working with us doesn't tie an artist to the label — artists are not explicitly signed unless that has been specifically agreed. We often collaborate with artists on individual releases rather than exclusive deals.",
  },
  {
    question: "How can artists work with Oscillation Records?",
    answer:
      "We're always listening. Reach out through our contact page to share your music, your story, or an idea — whether you're an established artist or just starting out. There's no obligation, and you stay free to release music independently or with others.",
  },
  {
    question: "What artists and releases are on Oscillation Records?",
    answer:
      "Our current roster is listed on the Artists page, and every single, EP and album we've put out is on the Releases page — both are kept up to date as new music is added.",
  },
];

// The plain-language entity definition. Rendered as visible prose so search
// engines and AI Overviews have a clean sentence to extract and attribute to us.
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
