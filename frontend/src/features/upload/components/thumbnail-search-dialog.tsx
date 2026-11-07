"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { cn } from "@/lib/utils";
import type { ThumbnailSearchResult } from "@/app/api/thumbnails/search/route";
import type { ThumbnailSource } from "@/app/api/thumbnails/providers";
import { checkThumbnailFile } from "../schemas";

type Status = "idle" | "searching" | "error" | "empty" | "done";

type SourceOption = { source: ThumbnailSource; label: string; enabled: boolean };

/** Turn a picked result's title into a safe `jpg`/`png`/`webp` filename. */
function filenameFor(result: ThumbnailSearchResult, contentType: string): string {
  const extension =
    contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const base = result.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "thumbnail"}.${extension}`;
}

/**
 * Search the internet for a thumbnail image and hand the chosen one back to the
 * parent as a File. Images come from the same-origin /api/thumbnails routes,
 * which proxy an openly licensed image source. The picked file is validated
 * with checkThumbnailFile before it leaves this dialog, so the form never
 * receives an image it would reject.
 */
export function ThumbnailSearchDialog({
  open,
  onOpenChange,
  onPicked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPicked: (file: File) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<ThumbnailSearchResult[]>([]);
  const [pickingId, setPickingId] = React.useState<string | null>(null);
  const [source, setSource] = React.useState<ThumbnailSource>("openverse");
  const [sources, setSources] = React.useState<SourceOption[]>([]);

  // Load which sources this deployment supports once, when the dialog first
  // opens. Google is only offered when the server has its credentials.
  React.useEffect(() => {
    if (!open || sources.length > 0) return;
    let active = true;
    fetch("/api/thumbnails/sources")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((data: { sources?: SourceOption[] }) => {
        if (active && data.sources?.length) setSources(data.sources);
      })
      .catch(() => {
        // Fall back to Openverse-only; it's always available.
        if (active) setSources([{ source: "openverse", label: "Openverse", enabled: true }]);
      });
    return () => {
      active = false;
    };
  }, [open, sources.length]);

  // Abort an in-flight search or download when a new one starts or the dialog
  // closes, so a slow response can't overwrite a newer result.
  const abortRef = React.useRef<AbortController | null>(null);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQuery("");
    setStatus("idle");
    setMessage(null);
    setResults([]);
    setPickingId(null);
    setSource("openverse");
  }, []);

  async function runSearchFor(q: string, from: ThumbnailSource) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("searching");
    setMessage(null);
    setResults([]);
    try {
      const response = await fetch(
        `/api/thumbnails/search?q=${encodeURIComponent(q)}&source=${from}`,
        { signal: controller.signal },
      );
      const data = (await response.json()) as {
        results?: ThumbnailSearchResult[];
        message?: string;
      };
      if (!response.ok) {
        setStatus("error");
        setMessage(data.message ?? "Search failed. Try again.");
        return;
      }
      const found = data.results ?? [];
      setResults(found);
      setStatus(found.length ? "done" : "empty");
    } catch {
      if (controller.signal.aborted) return;
      setStatus("error");
      setMessage("Search is unavailable right now. Try again in a moment.");
    }
  }

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    void runSearchFor(q, source);
  }

  async function pick(result: ThumbnailSearchResult) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPickingId(result.id);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/thumbnails/fetch?url=${encodeURIComponent(result.url)}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        setMessage(data?.message ?? "Couldn't use that image. Pick another one.");
        setPickingId(null);
        return;
      }
      const contentType =
        (response.headers.get("content-type") ?? "image/jpeg")
          .split(";")[0]
          .trim()
          .toLowerCase();
      const blob = await response.blob();
      const file = new File([blob], filenameFor(result, contentType), {
        type: contentType,
      });

      const check = checkThumbnailFile(file);
      if (!check.ok) {
        setMessage(check.message);
        setPickingId(null);
        return;
      }

      onPicked(file);
      onOpenChange(false);
    } catch {
      if (controller.signal.aborted) return;
      setMessage("Couldn't download that image. Pick another one.");
      setPickingId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent aria-describedby="thumbnail-search-desc">
        <DialogTitle>Search for a thumbnail</DialogTitle>
        <DialogDescription id="thumbnail-search-desc">
          Search the web for an image and use it as your thumbnail. JPG, PNG, or
          WebP up to 5 MB.
        </DialogDescription>

        {sources.length > 1 && (
          <div className="flex flex-col gap-1">
            <SegmentedTabs
              tabs={sources.map((s) => ({
                value: s.source,
                label: s.enabled ? s.label : `${s.label} (not configured)`,
              }))}
              value={source}
              onValueChange={(next) => {
                const picked = sources.find((s) => s.source === next);
                if (!picked?.enabled) {
                  setSource(next);
                  setResults([]);
                  setStatus("idle");
                  setMessage(
                    "Google image search isn't configured on this server. Set GOOGLE_IMAGE_SEARCH_KEY and GOOGLE_IMAGE_SEARCH_CX to enable it.",
                  );
                  return;
                }
                setSource(next);
                setMessage(null);
                // Re-run against the new source if there's already a query.
                if (query.trim()) {
                  runSearchFor(query.trim(), next);
                }
              }}
              idBase="thumbnail-source"
              aria-label="Image source"
            />
          </div>
        )}

        <form onSubmit={runSearch} className="flex gap-2" role="search">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try 'city skyline at night'"
            aria-label="Search for a thumbnail image"
            autoFocus
          />
          <Button type="submit" disabled={status === "searching" || !query.trim()}>
            {status === "searching" ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Search aria-hidden="true" />
            )}
            Search
          </Button>
        </form>

        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}

        <div className="min-h-40 overflow-y-auto">
          {status === "idle" && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Search to see images you can use.
            </p>
          )}
          {status === "empty" && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No images found. Try different words.
            </p>
          )}
          {status === "searching" && results.length === 0 && (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="animate-spin" aria-hidden="true" />
            </div>
          )}
          {results.length > 0 && (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {results.map((result) => {
                const busy = pickingId === result.id;
                const disabled = pickingId !== null && !busy;
                return (
                  <li key={result.id}>
                    <button
                      type="button"
                      onClick={() => pick(result)}
                      disabled={pickingId !== null}
                      title={result.title}
                      className={cn(
                        "group relative block w-full overflow-hidden rounded-media border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                        disabled && "opacity-50",
                      )}
                    >
                      <span className="relative block aspect-video w-full">
                        <Image
                          src={result.thumbnail}
                          alt={result.title}
                          fill
                          sizes="(max-width: 640px) 50vw, 240px"
                          className="object-cover transition-transform duration-150 group-hover:scale-105"
                          unoptimized
                        />
                        {busy && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                            <Loader2 className="animate-spin" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="block truncate px-2 py-1 text-left text-xs text-muted-foreground">
                        {result.provider}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
