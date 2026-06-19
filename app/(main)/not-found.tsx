import Link from "next/link";
import { Button } from "@/components/ui/button";

// Rendered (with the public Navbar/Footer from (main)/layout.tsx) whenever a
// public page calls notFound() — and served with a real HTTP 404 so search
// engines treat missing artists/releases as gone, not as thin 200 pages.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-[10%] py-20 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">404</p>
        <h1 className="mt-3 text-3xl font-light tracking-tighter sm:text-4xl">Page not found</h1>
        <p className="mt-3 text-muted-foreground">
          That page doesn’t exist or may have moved.
        </p>
        <Link href="/" className="mt-8 inline-block">
          <Button variant="outline" className="border-gray-700">
            Go home
          </Button>
        </Link>
      </div>
    </div>
  );
}
