import { Suspense } from "react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { api } from "@/lib/api/client";
import {
  VideoGrid,
  VideoGridSkeleton,
} from "@/features/videos/components/video-grid";

export const metadata = { title: "My Library" };

async function Watchlist() {
  const videos = await api.getWatchlist();
  return (
    <VideoGrid
      videos={videos}
      emptyMessage="Your watchlist is empty. Save films to find them here later."
    />
  );
}

export default function LibraryPage() {
  return (
    <PageShell>
      <PageTitle
        title="My Library"
        lead="Films you saved to watch later."
      />
      <Suspense fallback={<VideoGridSkeleton />}>
        <Watchlist />
      </Suspense>
    </PageShell>
  );
}
