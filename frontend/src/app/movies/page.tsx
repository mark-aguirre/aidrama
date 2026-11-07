import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { VideoListing } from "@/features/videos/components/video-listing";

export const metadata = { title: "Movies" };

export default function MoviesPage({ searchParams }: PageProps<"/movies">) {
  return (
    <PageShell>
      <PageTitle
        title="Films"
        lead="Full-length AI-generated features."
      />
      <VideoListing type="MOVIE" searchParams={searchParams} />
    </PageShell>
  );
}
