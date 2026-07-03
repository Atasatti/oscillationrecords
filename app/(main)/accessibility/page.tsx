import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility",
  description:
    "Oscillation Records' commitment to an accessible website — the WCAG standard we aim for, steps we've taken, and how to report an accessibility barrier.",
  alternates: { canonical: "/accessibility" },
};

const CONTACT_EMAIL = "hello@oscillationrecords.com";

export default function AccessibilityStatement() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-gray-300">
      <h1 className="text-3xl sm:text-4xl font-light tracking-tighter text-white">
        Accessibility
      </h1>

      <div className="mt-8 space-y-8 leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Our commitment</h2>
          <p>
            We want everyone to be able to discover and enjoy the music we release.
            We aim to meet the{" "}
            <a
              className="text-white underline"
              href="https://www.w3.org/TR/WCAG22/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Web Content Accessibility Guidelines (WCAG) 2.2, Level AA
            </a>
            , and we treat accessibility as part of building the site, not an
            afterthought.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">What we&rsquo;ve done</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>A &ldquo;skip to content&rdquo; link and clear keyboard focus outlines.</li>
            <li>Semantic headings and landmarks so screen readers can navigate pages.</li>
            <li>Descriptive alternative text on artist and release artwork.</li>
            <li>Respect for the operating-system &ldquo;reduce motion&rdquo; setting.</li>
            <li>A colour scheme chosen with legibility in mind on our dark theme.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Known limitations</h2>
          <p>
            The site includes rich audio and animated elements, and some third-party
            content (for example embedded streaming players) is outside our direct
            control. We&rsquo;re continuously improving and welcome your feedback.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Reporting a barrier</h2>
          <p>
            If you hit an accessibility barrier on this site, please tell us so we can
            fix it. Email{" "}
            <a className="text-white underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>{" "}
            or use our{" "}
            <a className="text-white underline" href="/contact">
              contact form
            </a>
            , describing the page and the problem. We aim to respond within a few
            working days.
          </p>
        </section>
      </div>
    </main>
  );
}
