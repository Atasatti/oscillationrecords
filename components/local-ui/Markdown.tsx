import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Safe Markdown renderer for owned press posts. react-markdown does NOT render raw
 * HTML (we don't add rehype-raw), so admin-authored Markdown can never inject
 * scripts — the body is treated as plain Markdown only. Rendered on the server so
 * the article text ships in the initial HTML (good for SEO). Styling lives in the
 * `.markdown` block in globals.css. remark-gfm adds tables, task lists, strikethrough
 * and autolinks.
 */
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
