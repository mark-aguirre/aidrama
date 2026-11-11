import { Suspense } from "react";
import { connection } from "next/server";
import { PageShell } from "@/components/layout/page-shell";
import { SectionHeader } from "@/components/layout/section-header";
import { ScrollRail } from "@/components/shared/scroll-rail";
import { api } from "@/lib/api/client";
import type { Video } from "@/types/domain";
import { FeaturedHero } from "@/features/videos/components/featured-hero";
import { GenreTiles } from "@/features/videos/components/genre-tiles";
import { MobileHome } from "@/features/videos/components/mobile-home";
import { VideoCard } from "@/features/videos/components/video-card";

export const metadata = {
  title: "Home",
};

function Rail({
  label,
  videos,
  ranked = false,
}: {
  label: string;
  videos: Video[];
  ranked?: boolean;
}) {
  if (videos.length === 0) {
    return (
      <p className="rounded-media border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Nothing here yet. New titles appear as creators publish them.
      </p>
    );
  }
  return (
    <ScrollRail label={label}>
      {videos.map((video, i) => (
        <VideoCard
          key={video.id}
          video={video}
          rank={ranked ? i + 1 : undefined}
          className="w-[72vw] shrink-0 snap-start sm:w-[260px]"
        />
      ))}
    </ScrollRail>
  );
}

async function HomeContent() {
  // Live catalogue data: fetch per request, never during the build prerender.
  await connection();
  const feed = await api.getHomeFeed();

  return (
    <>
      {/* Phones get their own composition (genre tabs, swipeable hero, rails,
          creator banner). `lg:contents` drops the desktop wrapper's box so the
          desktop layout is exactly what it was. */}
      <MobileHome feed={feed} />

      <div className="hidden lg:contents">
        <FeaturedHero featured={feed.featured} stats={feed.stats} />

        {/* `reveal-on-scroll` lets each block materialize as it rises into view
            (native scroll-driven animation; unsupported browsers and
            reduced-motion users just see it in place). */}
        <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-12 px-4 sm:px-8">
          <div className="reveal-on-scroll">
            <GenreTiles />
          </div>

          <section className="reveal-on-scroll">
            <SectionHeader title="Trending AI dramas" href="/explore?sort=popular" />
            <Rail label="Trending AI dramas" videos={feed.trending} ranked />
          </section>

          <section className="reveal-on-scroll">
            <SectionHeader
              title="AI originals"
              description="The newest titles from creators."
              href="/explore?sort=recent"
            />
            <Rail label="AI originals" videos={feed.originals} />
          </section>
        </div>
      </div>
    </>
  );
}

function HomeSkeleton() {
  return (
    <>
      <div className="lg:hidden" aria-hidden="true">
        <div className="mx-2 flex h-11 items-center gap-3 px-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 w-14 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" />
          ))}
        </div>
        <div className="aspect-[3/4] max-h-[min(34rem,72dvh)] animate-pulse bg-surface motion-reduce:animate-none" />
        <div className="flex gap-3 overflow-hidden px-4 pt-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-video w-[72vw] max-w-[22rem] shrink-0 animate-pulse rounded-media bg-surface-2 motion-reduce:animate-none" />
          ))}
        </div>
      </div>
      <div className="hidden lg:contents">
        <div className="-mt-16 h-[620px] animate-pulse bg-surface motion-reduce:animate-none" />
        <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-12 px-4 sm:px-8">
          <div className="flex gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-[72px] w-[92px] animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-video w-[260px] shrink-0 animate-pulse rounded-media bg-surface-2" />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    // `bare`: the hero is full-bleed under the navbar, so skip PageShell's padded column.
    <PageShell bare>
      <main className="flex-1">
        <Suspense fallback={<HomeSkeleton />}>
          <HomeContent />
        </Suspense>
      </main>
    </PageShell>
  );
}
