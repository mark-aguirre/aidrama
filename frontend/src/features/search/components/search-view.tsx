"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Search as SearchIcon } from "lucide-react";
import { api } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import {
  VideoGrid,
  VideoGridSkeleton,
} from "@/features/videos/components/video-grid";

/**
 * Global search (spec 3.14). Debounced input feeds a TanStack Query; results,
 * loading, empty, and no-query states are all handled distinctly.
 */
export function SearchFromUrl() {
  const q = useSearchParams().get("q") ?? "";
  // Re-key so a new search from the navbar resets the input.
  return <SearchView key={q} initialQuery={q} />;
}

export function SearchView({ initialQuery = "" }: { initialQuery?: string }) {
  const [input, setInput] = React.useState(initialQuery);
  const [query, setQuery] = React.useState(initialQuery.trim());

  // Debounce the query by 300ms.
  React.useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(id);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.search(query),
    enabled: query.length > 0,
  });

  return (
    <div>
      <div className="relative mb-8 max-w-xl">
        <SearchIcon
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search films, series, creators, genres"
          aria-label="Search"
          className="h-11 pl-10"
          autoFocus
        />
      </div>

      {query.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Start typing to search the catalogue.
        </p>
      ) : isFetching ? (
        <VideoGridSkeleton count={4} />
      ) : (
        <>
          <p className="mb-5 text-sm text-muted-foreground">
            {data?.length ?? 0} result{data?.length === 1 ? "" : "s"} for{" "}
            <span className="text-foreground">“{query}”</span>
          </p>
          <VideoGrid
            videos={data ?? []}
            emptyMessage="Nothing matched. Try a different title or genre."
          />
        </>
      )}
    </div>
  );
}
