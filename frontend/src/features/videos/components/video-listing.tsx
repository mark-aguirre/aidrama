import { Suspense } from "react";
import { api, type SortKey } from "@/lib/api/client";
import type { VideoType } from "@/types/domain";
import { getFeaturedTitle } from "../featured";
import { FilterBar } from "./filter-bar";
import { VideoGrid, VideoGridSkeleton, type GridView } from "./video-grid";

type SearchParams = Promise<{ genre?: string; sort?: string; view?: string }>;

function asSort(value: string | undefined): SortKey {
  return value === "recent" || value === "liked" ? value : "popular";
}

function asView(value: string | undefined): GridView {
  return value === "list" ? "list" : "grid";
}

async function Results({
  type,
  searchParams,
  highlightFeatured,
}: {
  type?: VideoType;
  searchParams: SearchParams;
  highlightFeatured: boolean;
}) {
  const { genre, sort, view } = await searchParams;
  const [{ data }, featured] = await Promise.all([
    api.listVideos({ type, genre, sort: asSort(sort) }),
    highlightFeatured ? getFeaturedTitle() : null,
  ]);
  const noun =
    type === "MOVIE" ? "films" : type === "SHORT" ? "shorts" : "titles";
  return (
    <VideoGrid
      videos={data}
      view={asView(view)}
      featuredId={featured?.video.id ?? null}
      emptyMessage={`No ${noun} match these filters. Try clearing the genre.`}
    />
  );
}

/**
 * Shared discovery listing used by Explore, Movies, and Shorts.
 * `type` narrows the content type; omit it for the full catalogue.
 * `highlightFeatured` badges the home feed's featured title in the results.
 * Genre, sort, and layout come from the URL via the client FilterBar; the
 * async Results resolve them inside the Suspense boundary so the page
 * prerenders.
 */
export function VideoListing({
  type,
  searchParams,
  highlightFeatured = false,
}: {
  type?: VideoType;
  searchParams: SearchParams;
  highlightFeatured?: boolean;
}) {
  return (
    <>
      {/* FilterBar reads useSearchParams, so it needs its own Suspense boundary. */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar />
      </Suspense>
      <Suspense fallback={<VideoGridSkeleton />}>
        <Results
          type={type}
          searchParams={searchParams}
          highlightFeatured={highlightFeatured}
        />
      </Suspense>
    </>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="mb-8 flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-full bg-surface-2"
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="h-10 w-64 animate-pulse rounded-md bg-surface-2" />
        <div className="h-9 w-[4.5rem] animate-pulse rounded-md bg-surface-2" />
      </div>
    </div>
  );
}
