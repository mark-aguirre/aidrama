"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for route segments. Pages read live data, so a backend or
 * network failure lands here instead of showing a blank page.
 */
export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl text-foreground">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        We couldn&apos;t load this page. Check your connection and try again.
      </p>
      <Button className="mt-6" onClick={reset}>
        Try again
      </Button>
    </main>
  );
}
