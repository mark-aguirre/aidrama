import { Suspense } from "react";
import { PageShell, PageTitle } from "@/components/layout/page-shell";
import {
  SearchFromUrl,
  SearchView,
} from "@/features/search/components/search-view";

export const metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <PageShell>
      <PageTitle title="Search" />
      <Suspense fallback={<SearchView />}>
        <SearchFromUrl />
      </Suspense>
    </PageShell>
  );
}
