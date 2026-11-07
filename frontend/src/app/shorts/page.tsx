import { PageShell, PageTitle } from "@/components/layout/page-shell";
import { VideoListing } from "@/features/videos/components/video-listing";

export const metadata = { title: "Shorts" };

export default function ShortsPage({ searchParams }: PageProps<"/shorts">) {
  return (
    <PageShell>
      <PageTitle
        title="Shorts"
        lead="Short-form AI films, under a few minutes each."
      />
      <VideoListing type="SHORT" searchParams={searchParams} />
    </PageShell>
  );
}
