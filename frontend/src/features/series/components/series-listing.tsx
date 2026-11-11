import { Suspense } from "react";
import { Layers } from "lucide-react";
import { cache } from "react";
import { api } from "@/lib/api/client";
import { FilterBar } from "@/features/videos/components/filter-bar";
import {
  COLLECTION_GRID,
  VideoGridSkeleton,
} from "@/features/videos/components/video-grid";
import { FilterBarSkeleton } from "@/features/videos/components/video-listing";
import { formatCount } from "@/lib/utils";
import { SeriesCard, SeriesRow } from "./series-card";

type SearchParams = Promise<{ genre?: string; view?: string }>;

/** One GET /series per render, shared by the results and the count. */
const loadSeries = cache((genre: string | undefined) =>
  api.listSeriesPage({ genre }),
);

/**
 * Live series total for the collection header, from the API's
 * `pagination.totalItems` for the current genre filter.
 */
export async function SeriesResultCount({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { genre } = await searchParams;
  const { pagination } = await loadSeries(genre);
  return <span>{formatCount(pagination.totalItems, "series", "series")}</span>;
}

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const { genre, view } = await searchParams;
  const { data: series } = await loadSeries(genre);

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-media border border-dashed border-border py-20 text-center">
        <Layers className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {genre
            ? "No series match this genre. Try clearing the genre."
            : "No series published yet."}
        </p>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="flex flex-col gap-2">
        {series.map((s) => (
          <SeriesRow key={s.id} series={s} />
        ))}
      </div>
    );
  }

  return (
    <div className={COLLECTION_GRID}>
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} />
      ))}
    </div>
  );
}

/**
 * Series discovery listing: genre and layout filters from the URL, then the
 * results. GET /series has no sort (always newest first), so the filter bar
 * hides its sort control.
 */
export function SeriesListing({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      {/* FilterBar reads useSearchParams, so it needs its own Suspense boundary. */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar sortable={false} />
      </Suspense>
      <Suspense fallback={<VideoGridSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}
