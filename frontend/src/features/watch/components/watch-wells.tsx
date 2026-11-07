import Link from "next/link";
import { AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Player-well placeholder while the video is queued, uploading, or transcoding. */
export function ProcessingWell({ isOwner }: { isOwner: boolean }) {
  return (
    <div
      aria-live="polite"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted px-4 text-center"
    >
      <Clock className="size-8 text-warning" aria-hidden="true" />
      <h2 className="font-display text-xl text-foreground">
        This video is still processing
      </h2>
      <p className="text-sm text-muted-foreground">
        It will be playable once transcoding finishes.
      </p>
      {isOwner && (
        <Button asChild variant="secondary" size="sm" className="mt-2">
          <Link href="/studio/content">Go to My Content</Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Player-well placeholder when processing failed. Only the owner sees the
 * reason and the way to re-upload; everyone else gets the generic message.
 */
export function UnavailableWell({
  isOwner,
  reason,
}: {
  isOwner: boolean;
  reason?: string;
}) {
  return (
    <div
      role="alert"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-muted px-4 text-center"
    >
      <AlertCircle className="size-8 text-destructive" aria-hidden="true" />
      <h2 className="font-display text-xl text-foreground">
        This video is unavailable
      </h2>
      <p className="text-sm text-muted-foreground">
        It couldn&apos;t be processed.
      </p>
      {isOwner && (
        <>
          {reason && (
            <p className="max-w-md text-sm text-foreground/80">{reason}</p>
          )}
          <Button asChild size="sm" className="mt-2">
            <Link href="/studio/upload">Re-upload</Link>
          </Button>
        </>
      )}
    </div>
  );
}
