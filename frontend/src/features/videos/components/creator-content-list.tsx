"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  AlertCircle,
  Film,
  Loader2,
  RefreshCw,
  SearchX,
  UploadCloud,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { segmentedPanelId, segmentedTabId } from "@/components/ui/segmented-tabs";
import { RequireCreator } from "@/features/auth/components/require-creator";
import { PublishForm } from "@/features/upload/components/publish-form";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { cn, formatDate, formatViews } from "@/lib/utils";
import type { Paginated, ProcessingStatus, Video } from "@/types/domain";
import {
  describeNoResults,
  describeResultCount,
  matchesFilter,
  SEARCH_DEBOUNCE_MS,
  serverStatusFor,
  type ContentFilter,
} from "../content-filter";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { ContentRowMenu } from "./content-row-menu";
import { ContentToolbar } from "./content-toolbar";
import { ProcessingBadge, PublicationBadge } from "./status-badge";

const PAGE_SIZE = 20;
/** Re-check the list this often while a video is uploading or transcoding. */
const POLL_INTERVAL_MS = 5000;
const POLLED: ReadonlySet<ProcessingStatus> = new Set(["UPLOADING", "PROCESSING"]);

const PROCESSING_NOTE: Partial<Record<ProcessingStatus, string>> = {
  PENDING: "Queued",
  UPLOADING: "Uploading…",
  PROCESSING: "Transcoding…",
};

/**
 * Desktop column template shared by the header row, the rows and the skeleton
 * so columns align: thumbnail / title + meta / status / views / actions.
 */
const COLUMNS = "md:grid-cols-[7rem_minmax(0,1fr)_10rem_6rem_minmax(9rem,auto)]";

/** Inline primary action: its own full-width line on mobile, inline on desktop. */
const PRIMARY_ACTION = "col-span-3 row-start-3 w-full md:w-auto";

type PanelKind = "publish" | "reason" | "delete";
type OpenPanel = { videoId: string; kind: PanelKind } | null;

const PANEL_LABEL: Record<PanelKind, string> = {
  publish: "Publish settings",
  reason: "Failure reason",
  delete: "Delete confirmation",
};

/** The signed-in creator's videos with their processing lifecycle (design S5). */
export function CreatorContentList() {
  return (
    <RequireCreator returnTo="/studio/content">
      <ContentBody />
    </RequireCreator>
  );
}

function ContentBody() {
  const [filter, setFilter] = React.useState<ContentFilter>("ALL");
  const [search, setSearch] = React.useState("");
  const [open, setOpen] = React.useState<OpenPanel>(null);
  const idBase = React.useId();

  // The input stays instant; the request waits for a pause in typing.
  const searchTerm = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  // Processing and Failed send no `status`, so they share the "all" cache entry.
  const serverStatus = serverStatusFor(filter);

  // Paging belongs to one tab and search term. Deriving it means a new term or
  // tab lands on page 1 without first fetching it against the old page number.
  const resultsKey = `${filter}:${searchTerm}`;
  const [cursor, setCursor] = React.useState({ resultsKey, page: 1 });
  const page = cursor.resultsKey === resultsKey ? cursor.page : 1;

  const query = useQuery({
    queryKey: ["creator-videos", page, serverStatus ?? "all", searchTerm],
    queryFn: ({ signal }) =>
      api.listCreatorVideos(
        { page, pageSize: PAGE_SIZE, status: serverStatus, q: searchTerm },
        signal,
      ),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.data.some((v) => POLLED.has(v.processingStatus))
        ? POLL_INTERVAL_MS
        : false,
  });

  const announcement = useTransitionAnnouncement(query.data?.data);

  const changeFilter = (next: ContentFilter) => {
    setFilter(next);
    setOpen(null);
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("ALL");
    setOpen(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <ContentToolbar
        filter={filter}
        onFilterChange={changeFilter}
        query={search}
        onQueryChange={setSearch}
        idBase={idBase}
      />
      <div
        role="tabpanel"
        id={segmentedPanelId(idBase)}
        aria-labelledby={segmentedTabId(idBase, filter)}
        className="flex flex-col gap-4"
      >
        <ContentResults
          query={query}
          filter={filter}
          searchTerm={searchTerm}
          page={page}
          onPageChange={(next) => setCursor({ resultsKey, page: next })}
          open={open}
          setOpen={setOpen}
          announcement={announcement}
          onClearFilters={clearFilters}
        />
      </div>
    </div>
  );
}

function ContentResults({
  query,
  filter,
  searchTerm,
  page,
  onPageChange,
  open,
  setOpen,
  announcement,
  onClearFilters,
}: {
  query: UseQueryResult<Paginated<Video>>;
  filter: ContentFilter;
  /** The debounced term these results were fetched with, not the live input. */
  searchTerm: string;
  page: number;
  onPageChange: (page: number) => void;
  open: OpenPanel;
  setOpen: React.Dispatch<React.SetStateAction<OpenPanel>>;
  announcement: string;
  onClearFilters: () => void;
}) {
  const { data } = query;

  if (query.isPending) return <ContentListSkeleton />;

  if (query.isError && !data) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-media border border-border py-16 text-center">
        <AlertCircle className="text-destructive" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {errorMessage(query.error, "We couldn't load your videos.")}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const videos = data?.data ?? [];
  const searching = searchTerm.length > 0;

  // Only a genuinely empty account gets the first-run panel; a search that found
  // nothing gets the in-list "no matches" panel further down.
  if (videos.length === 0 && page === 1 && filter === "ALL" && !searching) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-media border border-dashed border-border py-20 text-center">
        <Film className="text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          Nothing here yet. Upload your first film to get started.
        </p>
        <Button asChild>
          <Link href="/studio/upload">
            <UploadCloud aria-hidden="true" />
            Upload content
          </Link>
        </Button>
      </div>
    );
  }

  const rows = videos.filter((video) => matchesFilter(filter, video));
  const totalItems = data?.pagination.totalItems ?? 0;

  return (
    <div
      aria-busy={query.isPlaceholderData}
      className={cn(
        "flex flex-col gap-4 transition-opacity",
        query.isPlaceholderData && "opacity-60",
      )}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        {/* A live region so a screen reader hears the count settle after a search. */}
        <span role="status" className="tabular-nums">
          {describeResultCount({
            filter,
            query: searchTerm,
            shown: rows.length,
            totalItems,
          })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw
            className={query.isFetching ? "animate-spin motion-reduce:animate-none" : undefined}
            aria-hidden="true"
          />
          Refresh
        </Button>
      </div>

      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(query.error, "We couldn't refresh your videos.")}
        </p>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
            {searching ? (
              <SearchX className="text-muted-foreground" aria-hidden="true" />
            ) : (
              <Film className="text-muted-foreground" aria-hidden="true" />
            )}
            <p className="text-sm text-muted-foreground">
              {describeNoResults(filter, searchTerm)}
            </p>
            {(searching || filter !== "ALL") && (
              <Button variant="secondary" size="sm" onClick={onClearFilters}>
                {searching && filter === "ALL" ? "Clear search" : "Clear filters"}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div
              aria-hidden="true"
              className={cn(
                "hidden gap-x-4 border-b border-border/70 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid",
                COLUMNS,
              )}
            >
              <span />
              <span>Title</span>
              <span>Status</span>
              <span className="text-right">Views</span>
              <span className="text-right">Actions</span>
            </div>
            <ul className="divide-y divide-border/70">
              {rows.map((video) => (
                <ContentRow
                  key={video.id}
                  video={video}
                  open={open?.videoId === video.id ? open.kind : null}
                  onToggle={(kind) =>
                    setOpen((current) =>
                      current?.videoId === video.id && current.kind === kind
                        ? null
                        : { videoId: video.id, kind },
                    )
                  }
                  onPublished={() => setOpen(null)}
                  onDeleted={() => setOpen(null)}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {data && data.pagination.totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data.pagination.hasNext}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}

function ContentRow({
  video,
  open,
  onToggle,
  onPublished,
  onDeleted,
}: {
  video: Video;
  open: PanelKind | null;
  onToggle: (kind: PanelKind) => void;
  onPublished: () => void;
  onDeleted: () => void;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const focusPanelOnMenuClose = React.useRef(false);

  const canPublish =
    video.processingStatus === "READY" && video.publicationStatus !== "PUBLISHED";
  const failed = video.processingStatus === "FAILED";
  const published = video.publicationStatus === "PUBLISHED";
  const note = PROCESSING_NOTE[video.processingStatus];

  const showPublish = open === "publish" && canPublish;
  const showReason = open === "reason" && failed;
  const showDelete = open === "delete";
  const panelKind: PanelKind | null = showPublish
    ? "publish"
    : showReason
      ? "reason"
      : showDelete
        ? "delete"
        : null;

  /** A panel opened from the menu takes focus; Radix would otherwise return it to the trigger. */
  const openFromMenu = (kind: PanelKind) => {
    focusPanelOnMenuClose.current = true;
    onToggle(kind);
  };
  const handleMenuCloseAutoFocus = (event: Event) => {
    if (!focusPanelOnMenuClose.current) return;
    focusPanelOnMenuClose.current = false;
    event.preventDefault();
    (panelRef.current ?? triggerRef.current)?.focus();
  };
  const closePanel = (kind: PanelKind) => {
    onToggle(kind);
    triggerRef.current?.focus();
  };

  return (
    <li className="px-5 py-4 transition-colors hover:bg-accent/40">
      <div
        className={cn(
          "grid grid-cols-[5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 md:items-center md:gap-x-4",
          COLUMNS,
        )}
      >
        <div className="relative col-start-1 row-start-1 h-[45px] w-20 overflow-hidden rounded-md bg-surface-2 ring-1 ring-border/60 md:col-start-auto md:row-start-auto md:h-16 md:w-28">
          {video.thumbnailUrl ? (
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              sizes="(min-width: 768px) 112px, 80px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Film className="size-4" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="col-start-2 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
          <p className="truncate font-medium text-foreground" title={video.title}>
            {video.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{video.type}</span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span>{formatDate(video.createdAt)}</span>
            {video.isAiGenerated && (
              <Badge variant="signal">
                AI<span className="sr-only"> generated</span>
              </Badge>
            )}
            {note && (
              <>
                <span className="h-3 w-px bg-border" aria-hidden="true" />
                <span>{note}</span>
              </>
            )}
          </div>
        </div>

        <div className="col-span-2 col-start-1 row-start-2 flex items-center gap-1.5 md:col-span-1 md:col-start-auto md:row-start-auto">
          {video.processingStatus === "PROCESSING" && (
            <Loader2
              className="size-4 animate-spin text-warning motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          {failed && <AlertCircle className="size-4 text-destructive" aria-hidden="true" />}
          {video.processingStatus !== "READY" ? (
            <ProcessingBadge status={video.processingStatus} />
          ) : (
            <PublicationBadge status={video.publicationStatus} />
          )}
        </div>

        <p className="col-start-3 row-start-2 justify-self-end text-sm tabular-nums text-foreground md:col-start-auto md:row-start-auto md:justify-self-stretch md:text-right">
          {published ? (
            <>
              {formatViews(video.viewCount)}
              <span className="md:sr-only"> views</span>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="text-muted-foreground">
                —
              </span>
              <span className="sr-only">No views yet</span>
            </>
          )}
        </p>

        {/* Contents on mobile so the primary action and menu take their own grid cells. */}
        <div className="contents md:flex md:items-center md:justify-end md:gap-2">
          {canPublish ? (
            <Button
              size="sm"
              variant={open === "publish" ? "secondary" : "default"}
              className={PRIMARY_ACTION}
              aria-expanded={open === "publish"}
              onClick={() => onToggle("publish")}
            >
              Publish
            </Button>
          ) : published ? (
            <Button size="sm" variant="secondary" className={PRIMARY_ACTION} asChild>
              <Link href={`/watch/${video.slug}`}>Watch</Link>
            </Button>
          ) : failed ? (
            <Button size="sm" className={PRIMARY_ACTION} asChild>
              <Link href="/studio/upload">Re-upload</Link>
            </Button>
          ) : null}
          <ContentRowMenu
            video={video}
            triggerRef={triggerRef}
            triggerClassName="col-start-3 row-start-1 justify-self-end"
            onViewReason={() => openFromMenu("reason")}
            onDelete={() => openFromMenu("delete")}
            onCloseAutoFocus={handleMenuCloseAutoFocus}
          />
        </div>
      </div>

      {panelKind && (
        <div
          ref={panelRef}
          role="group"
          aria-label={PANEL_LABEL[panelKind]}
          tabIndex={-1}
          className="mt-4 rounded-media outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {showPublish && (
            <div className="rounded-media border border-border bg-surface p-4">
              <PublishForm
                videoId={video.id}
                idPrefix={`row-${video.id}`}
                onPublished={onPublished}
              />
            </div>
          )}
          {showReason && <FailureReason videoId={video.id} />}
          {showDelete && (
            <DeleteConfirm
              video={video}
              onCancel={() => closePanel("delete")}
              onDeleted={onDeleted}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** Inline confirmation and delete action for one video, matching the publish/reason panels. */
function DeleteConfirm({
  video,
  onCancel,
  onDeleted,
}: {
  video: Video;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.deleteVideo(video.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["creator-videos"] });
      onDeleted();
    },
  });

  const published = video.publicationStatus === "PUBLISHED";

  return (
    <div className="rounded-media border border-destructive/40 bg-destructive/10 p-4">
      <p className="text-sm font-medium text-foreground">
        Delete “{video.title}”?
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {published
          ? "This removes it from your channel and anywhere it's listed. This can't be undone."
          : "This removes it from your content. This can't be undone."}
      </p>
      {mutation.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage(mutation.error, "We couldn't delete this video. Try again.")}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          {mutation.isPending && (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          Delete
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onCancel}
          disabled={mutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function FailureReason({ videoId }: { videoId: string }) {
  const query = useQuery({
    queryKey: ["processing-status", videoId],
    queryFn: ({ signal }) => api.getProcessingStatus(videoId, signal),
  });

  return (
    <div
      role="status"
      className="rounded-media border border-destructive/40 bg-destructive/10 p-4 text-sm"
    >
      {query.isPending && (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading the reason
        </span>
      )}
      {query.isError && (
        <span className="text-destructive">
          {errorMessage(query.error, "We couldn't load the reason.")}
        </span>
      )}
      {query.data && (
        <span className="text-foreground/80">
          {query.data.failure?.message ??
            "Something went wrong during processing. Upload the video again."}
        </span>
      )}
    </div>
  );
}

/**
 * A polite message when a video in the list finishes processing or fails,
 * derived from the previous list so no effect is needed.
 */
function useTransitionAnnouncement(videos: Video[] | undefined): string {
  const [seenList, setSeenList] = React.useState<Video[] | undefined>(undefined);
  const [statuses, setStatuses] = React.useState<Record<string, ProcessingStatus>>({});
  const [message, setMessage] = React.useState("");

  if (videos && videos !== seenList) {
    setSeenList(videos);
    const next: Record<string, ProcessingStatus> = {};
    const messages: string[] = [];
    for (const video of videos) {
      next[video.id] = video.processingStatus;
      const before = statuses[video.id];
      if (before && before !== video.processingStatus) {
        if (video.processingStatus === "READY") {
          messages.push(`“${video.title}” is ready to publish.`);
        } else if (video.processingStatus === "FAILED") {
          messages.push(`“${video.title}” failed processing.`);
        }
      }
    }
    setStatuses(next);
    if (messages.length > 0) setMessage(messages.join(" "));
  }
  return message;
}

/** Placeholder shaped like the table: header bar plus five rows on the same grid. */
function ContentListSkeleton() {
  const block = "animate-pulse rounded bg-surface-2 motion-reduce:animate-none";
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Loading your content</p>
      <Card className="overflow-hidden">
        <div
          aria-hidden="true"
          className="hidden h-10 border-b border-border/70 bg-surface-2/40 md:block"
        />
        <ul aria-hidden="true" className="divide-y divide-border/70">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className={cn(
                "grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-3 px-5 py-4 md:gap-x-4",
                COLUMNS,
              )}
            >
              <div className={cn(block, "h-[45px] w-20 md:h-16 md:w-28")} />
              <div className="flex flex-col gap-2">
                <div className={cn(block, "h-4 w-3/4")} />
                <div className={cn(block, "h-3 w-1/2")} />
              </div>
              <div className={cn(block, "hidden h-5 w-24 rounded-full md:block")} />
              <div className={cn(block, "ml-auto hidden h-4 w-10 md:block")} />
              <div className={cn(block, "ml-auto hidden h-9 w-32 md:block")} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
