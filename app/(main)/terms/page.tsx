import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of the Oscillation Records website.",
  alternates: { canonical: "/terms" },
};

// NOTE: Working draft. Items in [brackets] must be confirmed by Oscillation
// Records and the document reviewed by a qualified professional before use.
const LAST_UPDATED = "[DATE]";
const CONTACT_EMAIL = "hello@oscillationrecords.com";

export default function TermsOfService() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-gray-300">
      <h1 className="text-3xl sm:text-4xl font-light tracking-tighter text-white">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">1. Acceptance</h2>
          <p>
            By accessing or using the Oscillation Records website (the
            &ldquo;Service&rdquo;), you agree to these Terms. If you do not agree, please
            do not use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">2. Accounts</h2>
          <p>
            Some features require signing in with a Google account. You are responsible
            for activity under your account and for keeping your access secure. You must
            provide accurate information and be old enough to use the Service under
            applicable law.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">3. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>copy, download, redistribute, or publicly perform our content except as expressly permitted;</li>
            <li>attempt to disrupt, reverse-engineer, scrape, or gain unauthorised access to the Service;</li>
            <li>use the Service unlawfully or to infringe others&rsquo; rights.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">4. Intellectual property</h2>
          <p>
            All music, recordings, artwork, logos, and other content on the Service are
            owned by Oscillation Records, its artists, or its licensors and are protected
            by law. Streaming on the Service does not transfer any ownership or licence
            beyond personal, non-commercial listening.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">5. Submissions</h2>
          <p>
            If you submit content (for example, a competition entry), you keep ownership
            of it but grant us a non-exclusive, worldwide, royalty-free licence to host
            and use it for operating and promoting the Service and the relevant
            competition. You confirm you have the rights to everything you submit.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">6. Third-party links</h2>
          <p>
            The Service links to third-party platforms (such as streaming and social
            services). We are not responsible for their content or practices; their own
            terms and privacy policies apply.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">7. Disclaimers</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind to
            the fullest extent permitted by law. We do not guarantee the Service will be
            uninterrupted or error-free.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">8. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, Oscillation Records will not be liable
            for any indirect, incidental, or consequential damages arising from your use
            of the Service. [Confirm liability wording for your jurisdiction.]
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">9. Changes</h2>
          <p>
            We may update these Terms from time to time. Continued use of the Service
            after changes means you accept the updated Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">10. Governing law</h2>
          <p>
            These Terms are governed by the laws of [jurisdiction], and disputes are
            subject to the courts of [jurisdiction].
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">11. Contact</h2>
          <p>
            Questions about these Terms? Email{" "}
            <a className="text-white underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
