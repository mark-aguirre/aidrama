"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotFoundPanel } from "@/components/shared/not-found-panel";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { getWatchState } from "../watch-state";
import { WatchView } from "./watch-view";

const POLL_INTERVAL_MS = 5000;

/**
 * Watch page for a video the public endpoint did not return. Only its owner
 * can load it (draft, processing, failed), and the token lives in the browser,
 * so this is fetched client-side. Anyone else gets the not-found state.
 */
export function OwnerWatch({ slug }: { slug: string }) {
  const session = useRestoredSession();
  const signedIn = session.status === "authenticated";

  const videoQuery = useQuery({
    queryKey: ["owner-video", slug],
    queryFn: () => api.getVideoBySlug(slug),
    enabled: signedIn,
    refetchInterval: (query) => {
      const video = query.state.data;
      return video && getWatchState(video) === "processing" ? POLL_INTERVAL_MS : false;
    },
  });
  const video = videoQuery.data ?? null;

  const relatedQuery = useQuery({
    queryKey: ["related-videos", video?.id],
    queryFn: () => (video ? api.getRelatedVideos(video.id) : []),
    enabled: video !== null,
  });

  const failureQuery = useQuery({
    queryKey: ["processing-status", video?.id],
    queryFn: () => (video ? api.getProcessingStatus(video.id) : null),
    enabled: video !== null && getWatchState(video) === "failed",
  });

  // Announce (without moving focus) when a video we saw processing becomes playable.
  const [sawProcessing, setSawProcessing] = React.useState(false);
  const state = video ? getWatchState(video) : null;
  if (state === "processing" && !sawProcessing) setSawProcessing(true);
  const readyMessage =
    sawProcessing && state === "playable"
      ? "Video is ready. Press play to watch."
      : "";

  if (session.status === "anonymous") return <NotFoundPanel />;

  if (session.failed || videoQuery.isError) {
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
        <AlertCircle className="text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {errorMessage(videoQuery.error, "We couldn't load this video.")}
        </p>
        <Button
          variant="secondary"
          onClick={() => (session.failed ? session.retry() : void videoQuery.refetch())}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!signedIn || videoQuery.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading video
      </div>
    );
  }

  if (!video) return <NotFoundPanel />;

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {readyMessage}
      </p>
      <WatchView
        video={video}
        related={relatedQuery.data ?? []}
        isOwner
        failureReason={failureQuery.data?.failure?.message}
      />
    </>
  );
}
