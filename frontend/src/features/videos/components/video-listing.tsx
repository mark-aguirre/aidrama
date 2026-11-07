import { Suspense } from "react";
import { api, type SortKey } from "@/lib/api/client";
import type { VideoType } from "@/types/domain";
import { FilterBar } from "./filter-bar";
import { VideoGrid, VideoGridSkeleton } from "./video-grid";

type SearchParams = Promise<{ genre?: string; sort?: string }>;

function asSort(value: string | undefined): SortKey {
  return value === "recent" || value === "liked" ? value : "popular";
}

async function Results({
  type,
  searchParams,
}: {
  type?: VideoType;
  searchParams: SearchParams;
}) {
  const { genre, sort } = await searchParams;
  const { data } = await api.listVideos({ type, genre, sort: asSort(sort) });
  const noun =
    type === "MOVIE" ? "films" : type === "SHORT" ? "shorts" : "titles";
  return (
    <VideoGrid
      videos={data}
      emptyMessage={`No ${noun} match these filters. Try clearing the genre.`}
    />
  );
}

/**
 * Shared discovery listing used by Explore, Movies, and Shorts.
 * `type` narrows the content type; omit it for the full catalogue.
 * Genre and sort come from the URL via the client FilterBar; the async
 * Results resolve them inside the Suspense boundary so the page prerenders.
 */
export function VideoListing({
  type,
  searchParams,
}: {
  type?: VideoType;
  searchParams: SearchParams;
}) {
  return (
    <>
      {/* FilterBar reads useSearchParams, so it needs its own Suspense boundary. */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar />
      </Suspense>
      <Suspense fallback={<VideoGridSkeleton />}>
        <Results type={type} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function FilterBarSkeleton() {
  return (
    <div className="mb-8 flex flex-col gap-4">
      <div className="flex gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-20 animate-pulse rounded-full bg-surface-2"
          />
        ))}
      </div>
      <div className="h-9 w-40 animate-pulse rounded-md bg-surface-2" />
    </div>
  );
}
