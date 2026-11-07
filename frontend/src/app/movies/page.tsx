import { PageShell } from "@/components/layout/page-shell";
import { DiscoveryPage } from "@/features/videos/components/discovery-hero";
import { VideoListing } from "@/features/videos/components/video-listing";

export const metadata = { title: "Movies" };

export default function MoviesPage({ searchParams }: PageProps<"/movies">) {
  return (
    // `bare`: the backdrop runs full-bleed under the navbar, so the page owns its <main>.
    <PageShell bare>
      <DiscoveryPage
        backdrop="MOVIE"
        eyebrow="Feature length"
        title="Films"
        accent="cinema made with imagination"
        lead="Full-length AI-generated features, filtered your way."
      >
        <VideoListing
          type="MOVIE"
          searchParams={searchParams}
          highlightFeatured
        />
      </DiscoveryPage>
    </PageShell>
  );
}
