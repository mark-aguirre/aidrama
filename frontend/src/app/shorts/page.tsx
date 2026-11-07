import { PageShell } from "@/components/layout/page-shell";
import { DiscoveryPage } from "@/features/videos/components/discovery-hero";
import { VideoListing } from "@/features/videos/components/video-listing";

export const metadata = { title: "Shorts" };

export default function ShortsPage({ searchParams }: PageProps<"/shorts">) {
  return (
    // `bare`: the backdrop runs full-bleed under the navbar, so the page owns its <main>.
    <PageShell bare>
      <DiscoveryPage
        backdrop="SHORT"
        eyebrow="Quick watches"
        title="Shorts"
        accent="whole stories in minutes"
        lead="Short-form AI films, under a few minutes each."
      >
        <VideoListing
          type="SHORT"
          searchParams={searchParams}
          highlightFeatured
        />
      </DiscoveryPage>
    </PageShell>
  );
}
