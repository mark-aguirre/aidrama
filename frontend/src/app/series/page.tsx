import { Suspense } from "react";
import { connection } from "next/server";
import { Layers } from "lucide-react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { api } from "@/lib/api/client";
import { SeriesCard } from "@/features/series/components/series-card";
import { VideoGridSkeleton } from "@/features/videos/components/video-grid";

export const metadata = { title: "Series" };

async function SeriesGrid() {
  // Live catalogue data: fetch per request, never during the build prerender.
  await connection();
  const series = await api.listSeries();

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-media border border-dashed border-border py-20 text-center">
        <Layers className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No series published yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} />
      ))}
    </div>
  );
}

export default function SeriesPage() {
  return (
    <PageShell>
      <PageTitle
        title="Series"
        lead="Episodic AI dramas, organized into seasons and episodes."
      />
      <Suspense fallback={<VideoGridSkeleton />}>
        <SeriesGrid />
      </Suspense>
    </PageShell>
  );
}
