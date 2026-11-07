"use client";

import dynamic from "next/dynamic";
import { Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TrailerSummary } from "@/types/domain";

// hls.js is large and only needed once a viewer opens the trailer, so the
// player is loaded on demand instead of with the page that hosts the button.
const VideoPlayer = dynamic(
  () => import("./video-player").then((module) => module.VideoPlayer),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
      >
        Loading trailer…
      </div>
    ),
  },
);

/**
 * "Watch trailer" control that plays the title's linked trailer in a modal.
 * The caller renders it only when the video has a playable trailer, so
 * `trailer.hlsUrl` is always set. The modal (Radix Dialog) traps focus, closes
 * on Escape or the Close button, and returns focus to this button. The player
 * mounts only while open, so closing the dialog stops playback and releases the
 * stream. No request is made here: the trailer comes with the video.
 */
export function WatchTrailerButton({
  trailer,
  fallbackPoster,
  className,
}: {
  trailer: TrailerSummary;
  /** Shown as the poster when the trailer has no thumbnail of its own. */
  fallbackPoster?: string | null;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex items-center gap-3 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            className,
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full border border-white/60 transition-colors group-hover:border-primary group-hover:bg-primary">
            <Play className="size-5 fill-white text-white" aria-hidden="true" />
          </span>
          <span className="text-sm font-medium text-foreground">Watch trailer</span>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{trailer.title}</DialogTitle>
        <DialogDescription className="sr-only">
          Trailer video player. Press Escape to close.
        </DialogDescription>
        <VideoPlayer
          src={trailer.hlsUrl}
          poster={trailer.thumbnailUrl ?? fallbackPoster}
          title={trailer.title}
          autoPlay
        />
      </DialogContent>
    </Dialog>
  );
}
