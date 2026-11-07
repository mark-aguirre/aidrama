"use client";

import * as React from "react";
import { ArrowUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { CONTENT_FILTERS, SEARCH_MAX_LENGTH, type ContentFilter } from "../content-filter";

/**
 * Sticky toolbar: status tabs, title search and sort. Tabs and search are live.
 * Sort has no creator-content endpoint yet, so it renders disabled with a
 * visible "coming soon" cue instead of faking behavior.
 */
export function ContentToolbar({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  idBase,
}: {
  filter: ContentFilter;
  onFilterChange: (filter: ContentFilter) => void;
  /** The raw input value, not the debounced term the list is showing. */
  query: string;
  onQueryChange: (query: string) => void;
  idBase: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const clear = () => {
    onQueryChange("");
    inputRef.current?.focus();
  };

  return (
    // top-16 clears the sticky site navbar (h-16, z-40).
    <div className="sticky top-16 z-10 flex flex-wrap items-center gap-x-3 gap-y-3 border-b border-border bg-background/95 py-3 backdrop-blur">
      <SegmentedTabs
        tabs={CONTENT_FILTERS}
        value={filter}
        onValueChange={onFilterChange}
        idBase={idBase}
        aria-label="Filter content by status"
      />
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center md:ml-auto">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                onQueryChange("");
              }
            }}
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Search your content"
            aria-label="Search your content by title"
            // The X below replaces WebKit's own cancel button, which it hides.
            className="pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <span className="flex sm:inline-flex" title="Sorting is coming soon">
          <Button variant="secondary" disabled className="w-full sm:w-auto">
            <ArrowUpDown aria-hidden="true" />
            Sort: Newest
            <span className="text-xs font-normal text-muted-foreground">Soon</span>
            <span className="sr-only">(coming soon)</span>
          </Button>
        </span>
      </div>
    </div>
  );
}
