import { Suspense } from "react";
import { Layers } from "lucide-react";
import { api } from "@/lib/api/client";
import { FilterBar } from "@/features/videos/components/filter-bar";
import { VideoGridSkeleton } from "@/features/videos/components/video-grid";
import { FilterBarSkeleton } from "@/features/videos/components/video-listing";
import { SeriesCard, SeriesRow } from "./series-card";

type SearchParams = Promise<{ genre?: string; view?: string }>;

async function Results({ searchParams }: { searchParams: SearchParams }) {
  const { genre, view } = await searchParams;
  const series = await api.listSeries({ genre });

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
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
