import Link from "next/link";
import Image from "next/image";
import { ExternalLink, ArrowRight } from "lucide-react";
import type { PressItemDTO } from "@/lib/catalog-data";
import { slugify } from "@/lib/slug";

/**
 * A single press/coverage card: our summary + link out to the original article.
 *
 * `mobileRow` renders a compact, scannable feed ROW on phones (square thumbnail
 * on the left, headline + publisher/date on the right; summary and tags hidden)
 * and reverts to the full image-top CARD from `sm:` up. Used for the long "More
 * coverage" list; the Featured items keep the full card at every width.
 */
export default function PressCard({
  item,
  mobileRow = false,
  priority = false,
}: {
  item: PressItemDTO;
  mobileRow?: boolean;
  /** Set on the first Featured card so its LCP image preloads (not lazy). */
  priority?: boolean;
}) {
  const date = item.publishedAt
    ? new Date(item.publishedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return (
    <article
      className={
        "group flex h-full w-full overflow-hidden border border-white/10 bg-white/[0.02] transition-colors hover:border-white/20 " +
        (mobileRow
          ? "gap-3 rounded-xl p-3 sm:flex-col sm:gap-0 sm:rounded-2xl sm:p-0"
          : "flex-col rounded-2xl")
      }
    >
      {item.image ? (
        // next/image serves resized WebP from the S3 original (allow-listed in
        // next.config). fill + a sized container keeps the two responsive shapes:
        // a 72px square row on mobile, a full aspect-video card from sm up.
        <div
          className={
            mobileRow
              ? "relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg sm:h-auto sm:w-full sm:rounded-none sm:aspect-video"
              : "relative aspect-video w-full overflow-hidden"
          }
        >
          <Image
            src={item.image}
            alt=""
            fill
            sizes={
              mobileRow
                ? "(max-width: 640px) 72px, (max-width: 1024px) 50vw, 33vw"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
            priority={priority}
            className="object-cover"
          />
        </div>
      ) : null}
      <div
        className={
          "flex min-w-0 flex-1 flex-col " +
          (mobileRow ? "gap-1.5 sm:gap-3 sm:p-5" : "gap-3 p-5")
        }
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-xs uppercase tracking-wide text-gray-400">
          {item.isOwned ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white">
              Oscillation Records
            </span>
          ) : (
            <span>{item.publisher}</span>
          )}
          {date ? <span className="text-gray-400">· {date}</span> : null}
        </p>
        {/* line-clamp bounds the height; break-words stops a long unbroken token
            (e.g. a URL-like headline) from overflowing the card width. */}
        <h3 className="line-clamp-2 break-words text-base font-medium leading-snug text-white sm:text-lg">{item.title}</h3>
        {item.summary ? (
          <p
            className={
              "line-clamp-4 break-words text-sm leading-relaxed text-gray-300 " +
              (mobileRow ? "hidden sm:block" : "")
            }
          >
            {item.summary}
          </p>
        ) : null}

        {(item.artists.length > 0 || item.releases.length > 0) ? (
          <div
            className={
              "flex-wrap gap-2 pt-1 " + (mobileRow ? "hidden sm:flex" : "flex")
            }
          >
            {item.artists.map((a) => (
              <Link
                key={`a-${a.id}`}
                href={`/artists/${slugify(a.name)}`}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-300 hover:border-white/30 hover:text-white"
              >
                {a.name}
              </Link>
            ))}
            {item.releases.map((r) => (
              <Link
                key={`r-${r.id}`}
                href={`/releases/${slugify(r.name)}`}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-gray-300 hover:border-white/30 hover:text-white"
              >
                {r.name}
              </Link>
            ))}
          </div>
        ) : null}

        {item.isOwned ? (
          <Link
            href={`/press/${item.slug}`}
            className={
              "inline-flex items-center gap-1.5 text-sm font-medium text-white hover:underline " +
              (mobileRow ? "mt-1 sm:mt-auto sm:pt-2" : "mt-auto pt-2")
            }
          >
            Read post <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : item.articleUrl ? (
          <a
            href={item.articleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={
              "inline-flex items-center gap-1.5 text-sm font-medium text-white hover:underline " +
              (mobileRow ? "mt-1 sm:mt-auto sm:pt-2" : "mt-auto pt-2")
            }
          >
            Read full article <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </div>
    </article>
  );
}
