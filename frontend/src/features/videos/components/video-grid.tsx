import { Film } from "lucide-react";
import type { Video } from "@/types/domain";
import { VideoCard, VideoRow } from "./video-card";

export type GridView = "grid" | "list";

/**
 * Responsive grid (or list) of video cards with an explicit empty state
 * (skill section 7). `featuredId` badges the home feed's featured title.
 */
export function VideoGrid({
  videos,
  emptyMessage = "No videos to show yet.",
  featuredId = null,
  view = "grid",
}: {
  videos: Video[];
  emptyMessage?: string;
  featuredId?: string | null;
  view?: GridView;
}) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-media border border-dashed border-border py-20 text-center">
        <Film className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="flex flex-col gap-2">
        {videos.map((video) => (
          <VideoRow
            key={video.id}
            video={video}
            featured={video.id === featuredId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          featured={video.id === featuredId}
          menu
        />
      ))}
    </div>
  );
}

/** Skeleton placeholders shown while a grid is loading. */
export function VideoGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
