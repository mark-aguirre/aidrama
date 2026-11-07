import { PageShell } from "@/components/layout/page-shell";
import { SeriesListing } from "@/features/series/components/series-listing";
import { DiscoveryPage } from "@/features/videos/components/discovery-hero";

export const metadata = { title: "Series" };

export default function SeriesPage({ searchParams }: PageProps<"/series">) {
  return (
    // `bare`: the backdrop runs full-bleed under the navbar, so the page owns its <main>.
    <PageShell bare>
      <DiscoveryPage
        backdrop="series"
        eyebrow="Season after season"
        title="Series"
        accent="stories that keep going"
        lead="Episodic AI dramas, organized into seasons and episodes."
      >
        <SeriesListing searchParams={searchParams} />
      </DiscoveryPage>
    </PageShell>
  );
}
