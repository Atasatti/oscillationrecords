import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Oscillation Records collects, uses, and protects your personal data, and the rights you have over it.",
  alternates: { canonical: "/privacy" },
};

// NOTE: This is a working draft tailored to the data the site actually handles.
// Items in [brackets] must be confirmed/filled by Oscillation Records and the
// whole document reviewed by a qualified professional before relying on it.
const LAST_UPDATED = "[DATE]";
const CONTACT_EMAIL = "privacy@oscillationrecords.com";

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-16 text-gray-300">
      <h1 className="text-3xl sm:text-4xl font-light tracking-tighter text-white">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <div className="mt-8 space-y-8 leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Who we are</h2>
          <p>
            Oscillation Records (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates this
            website. For privacy questions or to exercise your rights, contact us at{" "}
            <a className="text-white underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . [Legal entity name and registered address.] We are the data
            controller for the personal data described below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Information we collect</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Account information</strong> — when you
              sign in with Google, we receive your name, email address, and profile
              image.
            </li>
            <li>
              <strong className="text-white">Optional profile details</strong> — if you
              choose to share them, your gender, age, and location (country/city). These
              are optional and you can skip them.
            </li>
            <li>
              <strong className="text-white">Listening &amp; usage analytics</strong> —
              when signed in, we record which content you play and basic engagement
              (e.g. duration and completion), linked to your account, to understand our
              audience and improve the catalogue.
            </li>
            <li>
              <strong className="text-white">Outbound link clicks</strong> — we count
              clicks on streaming/social links to measure interest. This is recorded
              anonymously and is <em>not</em> tied to your identity.
            </li>
            <li>
              <strong className="text-white">Newsletter</strong> — if you subscribe, your
              email address.
            </li>
            <li>
              <strong className="text-white">Competition entries</strong> — if you enter a
              competition, the details and any files you submit.
            </li>
            <li>
              <strong className="text-white">Technical data</strong> — standard server logs
              (such as IP address and browser type) used for security and reliability.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Cookies</h2>
          <p>
            We use a strictly necessary cookie to keep you signed in (session
            authentication). We do not use third-party advertising cookies. [If any
            analytics/marketing cookies are added, update this section and add a consent
            banner.]
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">How we use your data</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Provide and secure the website and your account.</li>
            <li>Understand our audience and improve our content and releases.</li>
            <li>Send you updates you have opted into (newsletter), which you can leave at any time.</li>
            <li>Run competitions you choose to enter.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Legal bases (UK GDPR / GDPR)</h2>
          <p>
            We rely on: <strong className="text-white">consent</strong> (optional profile
            details and the newsletter); <strong className="text-white">legitimate
            interests</strong> (analytics to improve the service, and security);
            and <strong className="text-white">performance of a contract</strong>
            (operating your account). You can withdraw consent at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Who we share it with</h2>
          <p>
            We do not sell your personal data. We share it only with service providers
            who process it on our behalf, including: Google (sign-in), Amazon Web
            Services (media storage), MongoDB Atlas (database), and our hosting
            provider. [Confirm the full processor list, and any email provider.] These
            providers may process data outside the UK/EEA under appropriate safeguards.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">How long we keep it</h2>
          <p>
            We keep account data until you delete your account, newsletter data until
            you unsubscribe, and analytics for [retention period]. [Confirm retention
            periods.]
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Your rights</h2>
          <p>
            Subject to applicable law, you have the right to access, correct, delete,
            restrict, or object to the processing of your data, to data portability, and
            to withdraw consent. To exercise any of these, contact{" "}
            <a className="text-white underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . You also have the right to complain to your data protection authority (in
            the UK, the Information Commissioner&rsquo;s Office).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Security</h2>
          <p>
            Data is transmitted over HTTPS and access to administrative systems is
            restricted. No method of transmission or storage is completely secure, but we
            take reasonable measures to protect your information.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Children</h2>
          <p>
            This site is not directed to children, and the optional profile form is
            limited to ages 18 and over. [Confirm your minimum age policy.]
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Changes</h2>
          <p>
            We may update this policy from time to time. We will post the new version
            here and update the date above.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Contact</h2>
          <p>
            Questions? Email{" "}
            <a className="text-white underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . [Postal address.]
          </p>
        </section>
      </div>
    </main>
  );
}
