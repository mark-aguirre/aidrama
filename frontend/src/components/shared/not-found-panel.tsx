import Link from "next/link";
import { Button } from "@/components/ui/button";

/** "Not found" content shared by the 404 page and in-page not-found states. */
export function NotFoundPanel() {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-display text-6xl text-primary">404</p>
      <h1 className="mt-4 font-display text-2xl text-foreground">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The film or page you&apos;re looking for may have been unpublished or
        moved.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
