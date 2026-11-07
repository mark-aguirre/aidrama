import { ListPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProcessingBadge } from "@/features/videos/components/status-badge";
import { VideoCard } from "@/features/videos/components/video-card";
import { formatDate, formatViews } from "@/lib/utils";
import type { Video } from "@/types/domain";
import { getWatchState } from "../watch-state";
import { LikeButton } from "./like-button";
import { ShareButton } from "./share-button";
import { VideoPlayer } from "./video-player";
import { WatchTrailerButton } from "./watch-trailer-button";
import { ProcessingWell, UnavailableWell } from "./watch-wells";

/**
 * The watch page body. Playable videos get the full experience; videos that
 * are processing or failed keep the page chrome and swap only the player well
 * (design 3.2). Used by the server-rendered page and by the owner's
 * client-fetched view, so it has no hooks and no server-only imports. The
 * interactive Like and Share buttons are their own client components.
 */
export function WatchView({
  video,
  related,
  isOwner = false,
  failureReason,
}: {
  video: Video;
  related: Video[];
  isOwner?: boolean;
  failureReason?: string;
}) {
  const state = getWatchState(video);

  return (
    <div className="mx-auto grid w-full max-w-[1760px] grid-cols-1 gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        {state === "playable" && (
          <VideoPlayer
            src={video.hlsUrl}
            poster={video.thumbnailUrl}
            title={video.title}
            viewSlug={isOwner ? undefined : video.slug}
          />
        )}
        {state === "processing" && <ProcessingWell isOwner={isOwner} />}
        {state === "failed" && (
          <UnavailableWell isOwner={isOwner} reason={failureReason} />
        )}

        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-2">
            {state !== "playable" && (
              <ProcessingBadge status={video.processingStatus} />
            )}
            {video.genre && <Badge variant="outline">{video.genre}</Badge>}
            {video.isAiGenerated && (
              <Badge variant="signal">AI generated</Badge>
            )}
          </div>
          <h1 className="mt-3 font-display text-2xl leading-tight text-foreground sm:text-3xl">
            {video.title}
          </h1>
          {state === "playable" && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="tabular-nums">
                {formatViews(video.viewCount)} views
              </span>
              {video.publishedAt && (
                <>
                  <span className="h-3 w-px bg-border" aria-hidden="true" />
                  <span>{formatDate(video.publishedAt)}</span>
                </>
              )}
            </div>
          )}
          {state === "playable" && video.trailer && (
            <WatchTrailerButton
              trailer={video.trailer}
              fallbackPoster={video.thumbnailUrl}
              className="mt-4"
            />
          )}
        </div>

        {state !== "failed" && (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <LikeButton
                video={video}
                disabled={state === "processing"}
                describedBy={state === "processing" ? "watch-actions-hint" : undefined}
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={state === "processing"}
                aria-describedby={state === "processing" ? "watch-actions-hint" : undefined}
              >
                <ListPlus aria-hidden="true" />
                Watchlist
              </Button>
              <ShareButton
                video={video}
                disabled={state === "processing"}
                describedBy={state === "processing" ? "watch-actions-hint" : undefined}
              />
            </div>
            {state === "processing" && (
              <p id="watch-actions-hint" className="mt-2 text-xs text-muted-foreground">
                Available when the video is ready.
              </p>
            )}
          </div>
        )}

        {video.description && (
          <p className="mt-5 max-w-prose whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {video.description}
          </p>
        )}
      </div>

      {related.length > 0 && (
        <aside aria-label="Related videos" className="flex flex-col gap-5">
          <h2 className="font-display text-lg text-foreground">Keep watching</h2>
          {related.map((r) => (
            <VideoCard key={r.id} video={r} />
          ))}
        </aside>
      )}
    </div>
  );
}
