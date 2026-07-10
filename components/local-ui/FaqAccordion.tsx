// Reusable, server-rendered FAQ accordion — native <details> (no client JS), same
// visual language as the /about FAQ. Ships fully in the initial HTML so the Q&A is
// crawlable; the caller emits the matching FAQPage JSON-LD from the same items.
type FaqItem = { question: string; answer: string };

export default function FaqAccordion({
  items,
  heading = "Frequently asked questions",
  headingId = "faq-heading",
}: {
  items: FaqItem[];
  heading?: string;
  headingId?: string;
}) {
  if (!items.length) return null;
  return (
    <section aria-labelledby={headingId} className="mx-auto w-full max-w-3xl px-6 py-14 sm:py-16">
      <h2 id={headingId} className="text-2xl font-semibold tracking-tight text-foreground">
        {heading}
      </h2>
      <div className="mt-6 flex flex-col gap-3">
        {items.map((item) => (
          <details
            key={item.question}
            className="group rounded-xl border border-border bg-card px-5 py-4 transition-colors open:bg-white/[0.02]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-foreground [&::-webkit-details-marker]:hidden">
              {item.question}
              <span aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
