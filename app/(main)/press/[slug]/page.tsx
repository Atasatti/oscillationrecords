import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPressDetail } from "@/lib/catalog-data";
import { buildPressPostJsonLd, jsonLdScript, metaDescription, SITE_NAME } from "@/lib/seo";
import { slugify, OBJECT_ID_RE } from "@/lib/slug";
import { BLUR_DATA_URL } from "@/lib/image-blur";
import Markdown from "@/components/local-ui/Markdown";

// ISR: fresh + CDN-cacheable, matching the rest of the public catalog.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPressDetail(slug);
  if (!post) return { title: "Post not found", robots: { index: false } };
  const description = metaDescription(post.summary, 160);
  const canonical = `/press/${post.slug}`;
  return {
    title: post.title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: canonical,
      ...(post.image ? { images: [{ url: post.image }] } : {}),
      ...(post.publishedAt ? { publishedTime: post.publishedAt } : {}),
    },
  };
}

export default async function PressPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPressDetail(slug);
  if (!post) notFound();
  // A legacy / id-based URL 308-redirects to the canonical slug (mirrors releases/artists).
  if (OBJECT_ID_RE.test(slug) && post.slug !== slug) {
    permanentRedirect(`/press/${post.slug}`);
  }

  const dateLabel = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildPressPostJsonLd(post)) }}
      />

      <Link
        href="/press"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> Back to press
      </Link>

      <article>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">From {SITE_NAME}</p>
        <h1 className="mt-3 text-3xl font-light tracking-tighter text-white sm:text-4xl">
          {post.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {post.author ? <span>By {post.author}</span> : null}
          {post.author && dateLabel ? <span aria-hidden>·</span> : null}
          {dateLabel ? <time dateTime={post.publishedAt ?? undefined}>{dateLabel}</time> : null}
        </div>

        {post.image ? (
          <div className="relative mt-8 aspect-video w-full overflow-hidden rounded-2xl ring-1 ring-white/10">
            <Image
              src={post.image}
              alt={post.title}
              fill
              sizes="(max-width: 1152px) 100vw, 1152px"
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              priority
              className="object-cover"
            />
          </div>
        ) : null}

        {post.summary ? (
          <p className="mt-8 text-lg font-light leading-relaxed text-gray-200">{post.summary}</p>
        ) : null}

        <div className="mt-6 border-t border-white/10 pt-8">
          <Markdown content={post.body} />
        </div>

        {post.releases.length || post.artists.length ? (
          <div className="mt-12 border-t border-white/10 pt-6">
            <h2 className="text-sm font-medium text-muted-foreground">Related</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {post.releases.map((r) => (
                <Link
                  key={r.id}
                  href={`/releases/${slugify(r.name)}`}
                  className="rounded-full border border-white/15 px-3 py-1 text-sm text-gray-200 hover:border-white/40 hover:text-white"
                >
                  {r.name}
                </Link>
              ))}
              {post.artists.map((a) => (
                <Link
                  key={a.id}
                  href={`/artists/${slugify(a.name)}`}
                  className="rounded-full border border-white/15 px-3 py-1 text-sm text-gray-200 hover:border-white/40 hover:text-white"
                >
                  {a.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </article>
    </div>
  );
}
