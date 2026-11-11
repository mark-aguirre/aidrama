import { Suspense, cache } from "react";
import { api, type SortKey } from "@/lib/api/client";
import type { VideoType } from "@/types/domain";
import { getFeaturedTitle } from "../featured";
import { FilterBar } from "./filter-bar";
import { formatCount } from "@/lib/utils";
import { VideoGrid, VideoGridSkeleton, type GridView } from "./video-grid";

type SearchParams = Promise<{ genre?: string; sort?: string; view?: string }>;

function asSort(value: string | undefined): SortKey {
  return value === "recent" || value === "liked" ? value : "popular";
}

function asView(value: string | undefined): GridView {
  return value === "list" ? "list" : "grid";
}

/** One GET /videos per render, shared by the results and the count. */
const loadVideos = cache(
  (type: VideoType | undefined, genre: string | undefined, sort: SortKey) =>
    api.listVideos({ type, genre, sort }),
);

/**
 * Live result count for the collection header, from the API's
 * `pagination.totalItems` (the true total across pages) for the current
 * genre filter. The noun follows the page: titles, films, or shorts.
 */
export async function VideoResultCount({
  type,
  searchParams,
}: {
  type?: VideoType;
  searchParams: SearchParams;
}) {
  const { genre, sort } = await searchParams;
  const { pagination } = await loadVideos(type, genre, asSort(sort));
  const [singular, plural] =
    type === "MOVIE"
      ? ["film", "films"]
      : type === "SHORT"
        ? ["short", "shorts"]
        : ["title", "titles"];
  return <span>{formatCount(pagination.totalItems, singular, plural)}</span>;
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
    loadVideos(type, genre, asSort(sort)),
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
    <div className="mb-8 flex flex-col gap-5 max-lg:mb-4 max-lg:gap-3">
      {/* Below `sm` the real pills are one scrolling row, so the skeleton is
          too: it must not wrap into extra lines that the page then loses. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-8 w-24 shrink-0 animate-pulse rounded-full bg-surface-2"
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="h-11 w-40 animate-pulse rounded-md bg-surface-2 lg:h-10 lg:w-64" />
        <div className="h-11 w-[5.75rem] animate-pulse rounded-md bg-surface-2 lg:h-9 lg:w-[4.5rem]" />
      </div>
    </div>
  );
}
