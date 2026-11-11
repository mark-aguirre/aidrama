import { Film } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Video } from "@/types/domain";
import { VideoCard, VideoRow } from "./video-card";

export type GridView = "grid" | "list";

/**
 * Column layout for the grid view. Below `lg` it is the dense portrait
 * collection (3 columns, stepping up with width); from `lg` it is the wide
 * 16:9 grid. Shared by video and series results so they stay in step.
 */
export const COLLECTION_GRID =
  "grid grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-8 xl:grid-cols-4";

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
    <div className={COLLECTION_GRID}>
      {videos.map((video) => (
        <VideoCard
          key={video.id}
          video={video}
          featured={video.id === featuredId}
          menu
          collection
        />
      ))}
    </div>
  );
}

/**
 * Skeleton placeholders shown while a grid is loading. They match
 * `COLLECTION_GRID` (portrait tiles below `lg`); pass `wide` where the real
 * grid is the plain 16:9 layout at every width.
 */
export function VideoGridSkeleton({
  count = 8,
  wide = false,
}: {
  count?: number;
  wide?: boolean;
}) {
  return (
    <div
      className={
        wide
          ? "grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : COLLECTION_GRID
      }
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 max-lg:gap-1.5">
          <div
            className={cn(
              "aspect-video animate-pulse rounded-media bg-surface-2",
              !wide && "max-lg:aspect-[3/4]",
            )}
          />
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface-2 max-lg:h-3 max-lg:w-full" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2 max-lg:w-2/3" />
        </div>
      ))}
    </div>
  );
}
