import type { PublicationStatus, Video } from "@/types/domain";

/** Status tabs of the creator content list (spec 3.4). */
export type ContentFilter =
  | "ALL"
  | "PUBLISHED"
  | "DRAFT"
  | "PROCESSING"
  | "FAILED"
  | "UNPUBLISHED";

export const CONTENT_FILTERS: ReadonlyArray<{ value: ContentFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "PUBLISHED", label: "Published" },
  { value: "DRAFT", label: "Draft" },
  { value: "PROCESSING", label: "Processing" },
  { value: "FAILED", label: "Failed" },
  { value: "UNPUBLISHED", label: "Unpublished" },
];

/**
 * `GET /creator/videos` filters by publication status only. Processing and
 * Failed are processing-status values with no server parameter, so they (like
 * All) send no `status`.
 */
export function serverStatusFor(filter: ContentFilter): PublicationStatus | undefined {
  switch (filter) {
    case "PUBLISHED":
    case "DRAFT":
    case "UNPUBLISHED":
      return filter;
    default:
      return undefined;
  }
}

/**
 * Processing and Failed are filtered client-side over the fetched page. This is
 * interim until the backend supports a processing-status filter. The title
 * search is not in here: `GET /creator/videos?q=` runs it server-side.
 */
export function isClientFiltered(filter: ContentFilter): boolean {
  return filter === "PROCESSING" || filter === "FAILED";
}

/** Client-side half of the filter; server-side filters already narrowed the page. */
export function matchesFilter(filter: ContentFilter, video: Video): boolean {
  switch (filter) {
    case "PROCESSING":
      return video.processingStatus === "PROCESSING";
    case "FAILED":
      return video.processingStatus === "FAILED";
    default:
      return true;
  }
}

/** Longest search term the API accepts, matching the 200-character title column. */
export const SEARCH_MAX_LENGTH = 200;

/** How long typing has to pause before the search request goes out. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * The count line above the list. `totalItems` already accounts for the status
 * filter and the search, so it is the honest total across every page; only the
 * Processing and Failed tabs narrow the page further in the browser, and that is
 * the one case the copy has to qualify.
 */
export function describeResultCount({
  filter,
  query,
  shown,
  totalItems,
}: {
  filter: ContentFilter;
  query: string;
  shown: number;
  totalItems: number;
}): string {
  if (isClientFiltered(filter)) {
    return `${shown} of ${totalItems} ${noun(query, totalItems)} · filtered from this page`;
  }
  const total = `${totalItems} ${noun(query, totalItems)}`;
  return query ? `${total} for “${query}”` : total;
}

/**
 * Copy for the panel shown inside the list when nothing matched. Distinct from
 * the first-run empty state, which only covers an account with no videos at all.
 */
export function describeNoResults(filter: ContentFilter, query: string): string {
  if (query) {
    return filter === "ALL"
      ? `No results for “${query}”.`
      : `No ${labelFor(filter)} videos match “${query}”.`;
  }
  if (filter === "ALL") return "No videos on this page.";
  return isClientFiltered(filter)
    ? `No ${labelFor(filter)} videos on this page.`
    : `No ${labelFor(filter)} videos yet.`;
}

function noun(query: string, count: number): string {
  const word = query ? "result" : "video";
  return count === 1 ? word : `${word}s`;
}

function labelFor(filter: ContentFilter): string {
  const label = CONTENT_FILTERS.find((f) => f.value === filter)?.label ?? "";
  return label.toLowerCase();
}
