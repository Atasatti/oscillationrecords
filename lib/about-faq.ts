// Entity FAQ — the single source of truth for the visible Q&A on /about, the
// FAQPage JSON-LD (Google requires markup to match on-page text), AND the
// machine-readable /llms.txt. Pure data, so it's safe to import anywhere.
//
// The questions are phrased the way people (and AI assistants) actually ask them —
// including the explicit "we are NOT …" disambiguation that counters the current
// search/AI conflation with the band and the similarly-named labels. Keep answers
// factual and standalone (each should read as a complete, quotable statement).
export const ABOUT_FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "What is Oscillation Records?",
    answer:
      "Oscillation Records is an independent electronic record label based in Manchester, United Kingdom. It has been releasing music since 2021 — dubstep, drum & bass and house, alongside other genres — and was founded by Ben Sharp Knowles on a simple principle: put artists first.",
  },
  {
    question: "Who founded and runs Oscillation Records?",
    answer:
      "Oscillation Records was founded by Ben Sharp Knowles, who also records as the artist BSK and is one of the label's artists. It's run by a small, artist-first team.",
  },
  {
    question: "Where is Oscillation Records based?",
    answer:
      "Oscillation Records is based in Manchester, United Kingdom. It has been releasing music since 2021 and is registered at Companies House as Oscillation Records Ltd (company no. 15579381), incorporated in 2024.",
  },
  {
    question: "What genre or kind of music does Oscillation Records release?",
    answer:
      "Oscillation Records is primarily an electronic label — EDM, dubstep, drum & bass and house — and also releases hip-hop and crossover records. We're open to all genres and release music we believe in regardless of style.",
  },
  {
    question: "Is Oscillation Records a real, legitimate record label?",
    answer:
      "Yes. Oscillation Records is a UK-registered independent record label (Companies House company no. 15579381, trading as Oscillation Records Ltd), active and releasing music since 2021, with its catalogue available across the major streaming platforms.",
  },
  {
    question:
      "Is Oscillation Records the same as The Oscillation, Oscillations, or another similarly-named act?",
    answer:
      "No. Oscillation Records is a distinct independent record label from Manchester, UK, and is not affiliated with any similarly-named act. It is not The Oscillation (the London psychedelic / space-rock / drone project led by Demian Castellanos); it is not Oscillations (the London electronic / ambient label founded by Gabriel Prokofiev); and it is not any of the other similarly-named labels on Beatport, Bandcamp or Discogs — including “Oscillate Records” and a Chilean tech-house duo that also releases as “Oscillation Records”.",
  },
  {
    question: "Is Oscillation Records an exclusive label? Do artists have to sign to it?",
    answer:
      "No. Oscillation Records is not an exclusive label. Artists are free to release their music elsewhere and are not tied to the label unless that has been specifically agreed — we often collaborate on individual releases rather than exclusive deals.",
  },
  {
    question: "Do artists keep ownership and control of their music?",
    answer:
      "Yes. Oscillation Records is artist-first: artists keep creative control of their work and receive their royalties directly. The label is a partner on release planning, art direction, campaigns and honest feedback — not a rights grab.",
  },
  {
    question: "How can artists work with Oscillation Records or submit a demo?",
    answer:
      "We're always listening. Reach out through the contact page at oscillationrecords.com to share your music, your story, or an idea — whether you're established or just starting out. There's no obligation, and you stay free to release independently or with others.",
  },
  {
    question: "What artists and releases are on Oscillation Records?",
    answer:
      "The current roster is on the Artists page, and every single, EP and album we've put out is on the Releases page (oscillationrecords.com/releases) — both are kept up to date as new music is added.",
  },
];
