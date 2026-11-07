import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { api } from "@/lib/api/client";
import {
  VideoGrid,
  VideoGridSkeleton,
} from "@/features/videos/components/video-grid";
import { formatViews } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/channel/[username]">) {
  const { username } = await params;
  const result = await api.getChannel(username);
  if (!result) return { title: "Channel not found" };
  return { title: result.creator.displayName };
}

async function Channel({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const result = await api.getChannel(username);
  if (!result) notFound();
  const { creator, videos } = result;

  const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-accent font-display text-3xl text-foreground">
          {creator.displayName.charAt(0)}
        </div>
        <div className="flex-1">
          <h1 className="font-display text-3xl text-foreground">
            {creator.displayName}
          </h1>
          <p className="text-sm text-muted-foreground">@{creator.username}</p>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground tabular-nums">
            <span>{formatViews(creator.followerCount)} followers</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{videos.length} published</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{formatViews(totalViews)} total views</span>
          </div>
        </div>
      </header>

      <section>
        <h2 className="mb-5 font-display text-xl text-foreground">
          Published
        </h2>
        <VideoGrid
          videos={videos}
          emptyMessage="This creator has not published anything yet."
        />
      </section>
    </div>
  );
}

export default function ChannelPage({
  params,
}: PageProps<"/channel/[username]">) {
  return (
    <PageShell>
      <Suspense fallback={<VideoGridSkeleton />}>
        <Channel params={params} />
      </Suspense>
    </PageShell>
  );
}
