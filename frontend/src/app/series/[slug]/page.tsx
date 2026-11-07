import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { VideoCard } from "@/features/videos/components/video-card";
import { VideoGridSkeleton } from "@/features/videos/components/video-grid";

export async function generateMetadata({
  params,
}: PageProps<"/series/[slug]">) {
  const { slug } = await params;
  const result = await api.getSeriesBySlug(slug);
  if (!result) return { title: "Series not found" };
  return {
    title: result.series.title,
    description: result.series.description,
  };
}

async function SeriesDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await api.getSeriesBySlug(slug);
  if (!result) notFound();
  const { series, episodes } = result;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {series.genre && <Badge variant="outline">{series.genre}</Badge>}
          <Badge variant="signal">AI generated</Badge>
        </div>
        <h1 className="font-display text-3xl text-foreground sm:text-4xl">
          {series.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
          <span>{series.creator.displayName}</span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span>
            {series.seasonCount} season{series.seasonCount === 1 ? "" : "s"}
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span>{series.episodeCount} episodes</span>
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {series.description}
        </p>
      </header>

      <section>
        <h2 className="mb-5 font-display text-xl text-foreground">
          Season 1
        </h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Episodes are being prepared.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {episodes.map((ep) => (
              <VideoCard key={ep.id} video={ep} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function SeriesDetailPage({
  params,
}: PageProps<"/series/[slug]">) {
  return (
    <PageShell>
      <Suspense fallback={<VideoGridSkeleton />}>
        <SeriesDetail params={params} />
      </Suspense>
    </PageShell>
  );
}
