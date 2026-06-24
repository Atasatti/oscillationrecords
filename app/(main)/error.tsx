"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Error boundary for the public (main) routes. Rendered inside the (main)
// layout, so it keeps the Navbar/Footer chrome. Mirrors not-found.tsx styling.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the client error logger / console (server already logs digests).
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-[10%] py-20 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Error</p>
        <h1 className="mt-3 text-3xl font-light tracking-tighter sm:text-4xl">
          Something went wrong
        </h1>
        <p className="mt-3 text-muted-foreground">
          We’ve logged it and we’re looking into it. You can try again or head home.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button onClick={reset} variant="outline" className="border-gray-700">
            Try again
          </Button>
          <Link href="/" className="inline-block">
            <Button variant="ghost">Go home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
