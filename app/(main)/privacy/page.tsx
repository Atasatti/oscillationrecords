import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Oscillation Records collects, uses and protects your personal data, the third parties involved, the rights you have over it, and how to get in touch.",
  alternates: { canonical: "/privacy" },
};

// NOTE: Tailored to the data the site actually handles. Known facts (entity,
// company no., jurisdiction, processors) are filled in; the remaining [brackets]
// (registered office address, analytics retention period) are business decisions
// for Oscillation Records. Have a qualified professional review before relying on it.
const LAST_UPDATED = "2 July 2026";
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
            <strong className="text-white">Oscillation Records Ltd</strong>{" "}
            (&ldquo;we&rdquo;, &ldquo;us&rdquo;), a company registered in England and
            Wales (company number 15579381), operates this website and is the data
            controller for the personal data described below. Our registered office
            address is [registered office address]. For privacy questions or to
            exercise your rights, contact us at{" "}
            <a className="text-white underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
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
              <strong className="text-white">Google Analytics data</strong> — with your
              consent, Google Analytics collects standard usage data (such as page views,
              approximate location, device/browser, and how you arrived) to measure
              traffic. See &ldquo;Cookies&rdquo; below.
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
            We use a <strong className="text-white">strictly necessary</strong> cookie
            to keep you signed in (session authentication). This is required for the
            site to work and does not need consent.
          </p>
          <p>
            With your consent, we also set a single{" "}
            <strong className="text-white">first-party analytics cookie</strong> (a
            random anonymous identifier — not your name, email, or precise location).
            It lets us count plays and page views and understand which releases
            resonate, including from visitors who aren&apos;t signed in. We also use a
            short-lived <strong className="text-white">session cookie</strong> to group
            your activity into a single visit, and we read campaign tags
            (<code>utm_source</code>/<code>utm_medium</code>/<code>utm_campaign</code>)
            from links you arrive through so we can see which promotions work.
          </p>
          <p>
            With the same consent we also load{" "}
            <strong className="text-white">Google Analytics</strong> (Google&apos;s
            gtag.js), a third-party service that sets its own cookies (such as{" "}
            <code>_ga</code>) to measure page views and traffic on our behalf. It is
            loaded <em>only</em> after you accept; if you reject, it is never loaded and
            sets no cookies. We never sell your data and we don&apos;t use advertising or
            ad-targeting cookies. Data collected through Google Analytics is processed by
            Google as described in &ldquo;Who we share it with&rdquo; below.
          </p>
          <p>
            With the same consent we also load{" "}
            <strong className="text-white">Microsoft Clarity</strong>, a third-party
            product-analytics service that helps us understand how visitors use the site
            (for example, aggregated interaction and page-usage insights). Like Google
            Analytics it is loaded <em>only</em> after you accept, sets its own cookies,
            and is processed on our behalf by Microsoft; we never use it for advertising.
            It is not run in our administrative area.
          </p>
          <p>
            You choose when you first visit (&ldquo;Accept&rdquo; or &ldquo;Reject
            non-essential&rdquo;). If you reject, no analytics cookies are set, Google
            Analytics is not loaded, and we don&apos;t track your activity. You can
            change your mind any time by clearing this site&apos;s cookies in your
            browser; we&apos;ll ask again on your next visit.
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
            details, the newsletter, and analytics cookies — including Google Analytics);{" "}
            <strong className="text-white">legitimate interests</strong> (keeping the site
            secure and operational); and <strong className="text-white">performance of a
            contract</strong> (operating your account). You can withdraw consent at any time.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Who we share it with</h2>
          <p>
            We do not sell your personal data. We share it only with service providers
            who process it on our behalf, including: Google — for sign-in and, with your
            consent, <strong className="text-white">Google Analytics</strong> (website
            analytics); Microsoft — for <strong className="text-white">Microsoft
            Clarity</strong> (product analytics), with your consent; Amazon Web Services
            (media storage); MongoDB Atlas (database); and Vercel (hosting). Some of these
            providers, including Google and Microsoft, are based in the United States, so
            your data may be transferred outside the UK/EEA under appropriate safeguards
            (such as the UK extension to the EU&ndash;US Data Privacy Framework or Standard
            Contractual Clauses).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">How long we keep it</h2>
          <p>
            We keep account data until you delete your account and newsletter data until
            you unsubscribe. Analytics data is retained for a limited period appropriate
            to the purpose — [set your analytics retention period].
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-medium text-white">Your rights</h2>
          <p>
            Subject to applicable law, you have the right to access, correct, delete,
            restrict, or object to the processing of your data, to data portability, and
            to withdraw consent. Signed-in users can{" "}
            <a className="text-white underline" href="/account">
              download their data or delete their account
            </a>{" "}
            directly &mdash; deleting your account removes the personal data associated
            with it &mdash; or contact{" "}
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
            limited to ages 18 and over.
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
            . Postal enquiries can be sent to our registered office,{" "}
            Oscillation Records Ltd, [registered office address].
          </p>
        </section>
      </div>
    </main>
  );
}
