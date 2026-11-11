import { PageShell } from "@/components/layout/page-shell";
import { DiscoveryPage } from "@/features/videos/components/discovery-hero";
import {
  VideoListing,
  VideoResultCount,
} from "@/features/videos/components/video-listing";

export const metadata = { title: "Explore" };

export default function ExplorePage({
  searchParams,
}: PageProps<"/explore">) {
  return (
    // `bare`: the backdrop runs full-bleed under the navbar, so the page owns its <main>.
    <PageShell bare>
      <DiscoveryPage
        backdrop="featured"
        eyebrow="Stories without limits"
        title="Explore"
        accent="a bigger world of stories"
        lead="Browse everything published on AI Drama, filtered your way."
        count={<VideoResultCount searchParams={searchParams} />}
      >
        <VideoListing searchParams={searchParams} highlightFeatured />
      </DiscoveryPage>
    </PageShell>
  );
}
