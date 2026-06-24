"use client";

import { useEffect } from "react";

// Root-level fallback: only fires when the root layout itself throws, so it must
// render its own <html>/<body> (the normal layout/styles aren't available here).
// Inline styles keep it on-brand (dark, minimal) without depending on globals.css.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0f",
          color: "#ffffff",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          padding: "10%",
          textAlign: "center",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 12,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#9a9a9a",
              margin: 0,
            }}
          >
            Error
          </p>
          <h1 style={{ marginTop: 12, fontSize: 32, fontWeight: 300, letterSpacing: "-0.02em" }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 12, color: "#9a9a9a" }}>
            Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 32,
              padding: "8px 20px",
              borderRadius: 9999,
              border: "1px solid #3a3a3a",
              background: "transparent",
              color: "#ffffff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
