import { Suspense, cache } from "react";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { api } from "@/lib/api/client";
import { SESSION_HINT_COOKIE } from "@/lib/auth/constants";
import { OwnerWatch } from "@/features/watch/components/owner-watch";
import { WatchView } from "@/features/watch/components/watch-view";

/** One lookup per request, shared by generateMetadata and the page body. */
const getVideo = cache((slug: string) => api.getVideoBySlug(slug));

export async function generateMetadata({
  params,
}: PageProps<"/watch/[slug]">) {
  const { slug } = await params;
  const video = await getVideo(slug);
  if (!video) return { title: "Video not found" };
  return {
    title: video.title,
    description: video.description,
    openGraph: {
      title: video.title,
      description: video.description,
      images: video.thumbnailUrl ? [video.thumbnailUrl] : [],
    },
  };
}

async function WatchContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const video = await getVideo(slug);

  if (!video) {
    // The public endpoint hides drafts, processing, and failed videos from
    // everyone but their owner. Visitors without a session get a real 404;
    // a possible owner gets the client-side view that can send the token.
    const mayBeOwner = (await cookies()).has(SESSION_HINT_COOKIE);
    if (!mayBeOwner) notFound();
    return <OwnerWatch slug={slug} />;
  }

  // The sidebar is secondary: a failure there must not take down the player.
  const related = await api
    .getRelatedVideos(video.id)
    .catch(() => []);

  return <WatchView video={video} related={related} />;
}

function WatchSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <div className="aspect-video w-full animate-pulse rounded-lg bg-muted lg:max-w-[calc(100%-352px)]" />
      <div className="mt-4 h-6 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}

export default function WatchPage({ params }: PageProps<"/watch/[slug]">) {
  return (
    // `bare`: the player keeps its own width and padding instead of PageShell's column.
    <PageShell bare>
      <main className="w-full flex-1 px-4 py-8 sm:px-8">
        <Suspense fallback={<WatchSkeleton />}>
          <WatchContent params={params} />
        </Suspense>
      </main>
    </PageShell>
  );
}
