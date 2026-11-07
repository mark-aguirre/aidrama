import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { formatViews } from "@/lib/utils";
import { ViewsChart } from "@/features/analytics/components/views-chart";

export const metadata = { title: "Analytics" };

async function AnalyticsData() {
  const [stats, series, content] = await Promise.all([
    api.getCreatorStats(),
    api.getViewsSeries(),
    api.listMyContent(),
  ]);

  const topVideos = [...content]
    .filter((v) => v.publicationStatus === "PUBLISHED")
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, 5);

  const windowViews = series.reduce((sum, p) => sum + p.views, 0);

  const summary = [
    { label: "Views (14 days)", value: formatViews(windowViews) },
    { label: "Total views", value: formatViews(stats.totalViews) },
    { label: "Followers", value: formatViews(stats.followerCount) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4">
        {summary.map((s) => (
          <Card key={s.label} className="p-5">
            <p className="font-display text-3xl text-foreground tabular-nums">
              {s.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="mb-6 font-display text-xl text-foreground">
          Views over time
        </h2>
        <ViewsChart data={series} />
      </Card>

      <div>
        <h2 className="mb-4 font-display text-xl text-foreground">
          Top performing
        </h2>
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border/70">
            {topVideos.map((v, i) => (
              <li
                key={v.id}
                className="flex items-center gap-4 px-5 py-3.5"
              >
                <span className="font-display text-lg text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {v.title}
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatViews(v.viewCount)} views
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-foreground">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How your content is performing.
        </p>
      </div>
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsData />
      </Suspense>
    </div>
  );
}
