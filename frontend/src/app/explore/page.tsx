import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { VideoListing } from "@/features/videos/components/video-listing";

export const metadata = { title: "Explore" };

export default function ExplorePage({
  searchParams,
}: PageProps<"/explore">) {
  return (
    <PageShell>
      <PageTitle
        title="Explore"
        lead="Browse everything published on AI Drama, filtered your way."
      />
      <VideoListing searchParams={searchParams} />
    </PageShell>
  );
}
