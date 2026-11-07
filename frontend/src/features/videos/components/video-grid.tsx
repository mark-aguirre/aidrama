import { Film } from "lucide-react";
import type { Video } from "@/types/domain";
import { VideoCard } from "./video-card";

/** Responsive grid of video cards with an explicit empty state (skill section 7). */
export function VideoGrid({
  videos,
  emptyMessage = "No videos to show yet.",
}: {
  videos: Video[];
  emptyMessage?: string;
}) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-media border border-dashed border-border py-20 text-center">
        <Film className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

/** Skeleton placeholders shown while a grid is loading. */
export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="aspect-video animate-pulse rounded-media bg-surface-2" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}
