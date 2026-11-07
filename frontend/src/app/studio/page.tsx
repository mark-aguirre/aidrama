import { Suspense } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { formatViews } from "@/lib/utils";
import { PublicationBadge } from "@/features/videos/components/status-badge";

export const metadata = { title: "Overview" };

async function OverviewData() {
  const [stats, content] = await Promise.all([
    api.getCreatorStats(),
    api.listMyContent(),
  ]);

  const secondary = [
    { label: "Published", value: String(stats.publishedCount) },
    { label: "Drafts", value: String(stats.draftCount) },
    { label: "Followers", value: formatViews(stats.followerCount) },
  ];

  return (
    <>
      {/* Primary metric leads, secondary metrics sit quietly beside it —
          not four identical cards. */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_2fr]">
        <Card className="relative overflow-hidden p-6">
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-1 bg-primary"
          />
          <p className="text-sm text-muted-foreground">Total views</p>
          <p className="mt-2 font-display text-5xl text-foreground tabular-nums">
            {formatViews(stats.totalViews)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">across all content</p>
        </Card>

        <div className="grid grid-cols-3 gap-4">
          {secondary.map((s) => (
            <Card
              key={s.label}
              className="flex flex-col justify-center p-5"
            >
              <p className="font-display text-3xl text-foreground tabular-nums">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-10 mb-4 flex items-end justify-between">
        <h2 className="font-display text-xl text-foreground">Recent content</h2>
        <Link
          href="/studio/content"
          className="text-sm text-primary hover:text-primary/80"
        >
          View all
        </Link>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border/70">
          {content.slice(0, 5).map((video) => (
            <li
              key={video.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40"
            >
              <span className="truncate text-sm">{video.title}</span>
              <PublicationBadge status={video.publicationStatus} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_2fr]">
      <div className="h-40 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

export default function StudioOverviewPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your studio at a glance.
          </p>
        </div>
        <Button asChild>
          <Link href="/studio/upload">Upload content</Link>
        </Button>
      </div>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewData />
      </Suspense>
    </div>
  );
}
