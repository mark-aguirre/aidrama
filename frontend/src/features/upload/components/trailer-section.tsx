"use client";

import { AlertCircle, CheckCircle2, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProcessingStatus } from "@/types/domain";
import type { TrailerPhase, TrailerTrack } from "../hooks/use-trailer-upload";
import { DropZone } from "./drop-zone";
import { FileSummary } from "./file-summary";
import { UploadProgress } from "./upload-progress";

const STATUS_BY_PHASE: Record<
  Exclude<TrailerPhase, "idle" | "selected">,
  ProcessingStatus
> = {
  creating: "PENDING",
  uploading: "UPLOADING",
  processing: "PROCESSING",
  ready: "READY",
  failed: "FAILED",
};

const ANNOUNCEMENT: Partial<Record<TrailerPhase, string>> = {
  creating: "Preparing your trailer.",
  uploading: "Uploading your trailer.",
  processing: "Trailer upload complete. Processing has started.",
  ready: "Your trailer is ready.",
};

/** Where the trailer stands in being attached to the main video. */
function LinkStatus({ track, titleId }: { track: TrailerTrack; titleId: string | null }) {
  const { linked, linkFailure } = track.state;

  if (linked) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link2 className="size-4 shrink-0" aria-hidden="true" />
        Linked to your video.
      </p>
    );
  }

  if (linkFailure) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p className="flex items-start gap-2 text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {linkFailure.message}{" "}
            <span className="text-foreground/80">
              Your main video can still be published without a trailer.
            </span>
          </span>
        </p>
        {linkFailure.requestId && (
          <p className="text-xs text-muted-foreground">Reference: {linkFailure.requestId}</p>
        )}
        {linkFailure.retryable && (
          <Button type="button" variant="secondary" size="sm" onClick={track.retryLink}>
            Try linking again
          </Button>
        )}
      </div>
    );
  }

  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link2 className="size-4 shrink-0" aria-hidden="true" />
      {titleId ? "Linking to your video…" : "Links to your video once it is created."}
    </p>
  );
}

/**
 * The optional trailer attached to an upload. Before the main upload starts it
 * is a picker; once started it is a status card with its own progress, so the
 * main video and the trailer are always told apart. `deferred` is true while
 * the trailer waits for the main "Start upload" and false once it can be
 * started on its own (after a cancel or a chosen replacement file).
 */
export function TrailerSection({
  track,
  titleId,
  deferred,
}: {
  track: TrailerTrack;
  titleId: string | null;
  deferred: boolean;
}) {
  const { state } = track;
  const { phase, file, failure, details } = state;
  const started = state.trailerId !== null || (phase !== "idle" && phase !== "selected");

  return (
    <section
      aria-labelledby="trailer-heading"
      className="flex w-full flex-col gap-4 rounded-media border border-border/70 p-4"
    >
      <div>
        <h3 id="trailer-heading" className="font-display text-base text-foreground">
          {started ? "Trailer" : "Trailer (optional)"}
        </h3>
        {!started && (
          <p className="mt-1 text-sm text-muted-foreground">
            Add a short trailer for the Watch trailer button. It uploads separately from
            your main video, and you can publish without it.
          </p>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {phase === "failed"
          ? failure?.stage === "processing"
            ? "Trailer processing failed."
            : "Trailer upload failed."
          : (ANNOUNCEMENT[phase] ?? "")}
      </p>

      {phase === "idle" && (
        <div className="flex flex-col gap-3">
          <DropZone
            onFile={track.pickFile}
            invalid={Boolean(state.fileError)}
            prompt="Drag and drop a trailer, or choose a file."
            actionLabel="Choose trailer file"
            inputLabel="Trailer video file"
            className="py-8 sm:py-8"
          />
          {state.fileError && (
            <p role="alert" className="text-sm text-destructive">
              {state.fileError}
            </p>
          )}
        </div>
      )}

      {phase === "selected" && file && (
        <>
          {state.notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {state.notice}
            </p>
          )}
          <FileSummary
            file={file}
            status={null}
            label="Trailer"
            removeLabel="Remove trailer file"
            onRemove={track.clearFile}
          />
          {deferred ? (
            <p className="text-sm text-muted-foreground">
              Uploads at the same time as your main video.
            </p>
          ) : (
            details && (
              <Button type="button" className="self-start" onClick={() => track.begin(details)}>
                Upload trailer
              </Button>
            )
          )}
        </>
      )}

      {phase === "creating" && file && (
        <>
          <FileSummary file={file} status={STATUS_BY_PHASE.creating} label="Trailer" />
          <p className="text-sm text-muted-foreground">Getting the trailer ready…</p>
        </>
      )}

      {phase === "uploading" && file && (
        <>
          <FileSummary file={file} status={STATUS_BY_PHASE.uploading} label="Trailer" />
          <UploadProgress
            percent={state.progress}
            label="Uploading trailer"
            ariaLabel="Trailer upload progress"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-destructive hover:text-destructive"
            onClick={track.cancel}
          >
            Cancel trailer upload
          </Button>
        </>
      )}

      {phase === "processing" && file && (
        <>
          <FileSummary file={file} status={STATUS_BY_PHASE.processing} label="Trailer" />
          <div className="flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Processing trailer
              {track.statusQuery.percent > 0 && <> · {track.statusQuery.percent}%</>}
            </p>
            <p className="text-muted-foreground">
              Publishing your main video does not wait for the trailer. The Watch trailer
              button appears once the trailer is ready.
            </p>
            {track.statusQuery.error && (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
                We couldn&apos;t check the trailer status.
                <Button type="button" variant="secondary" size="sm" onClick={track.statusQuery.retry}>
                  Check again
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {phase === "ready" && file && (
        <>
          <FileSummary file={file} status={STATUS_BY_PHASE.ready} label="Trailer" />
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            Your trailer is ready.
          </p>
        </>
      )}

      {phase === "failed" && file && failure && (
        <>
          <FileSummary file={file} status={STATUS_BY_PHASE.failed} label="Trailer" />
          <div
            role="alert"
            className="rounded-media border border-destructive/40 bg-destructive/10 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-display text-base text-foreground">
                  {failure.stage === "processing"
                    ? "Trailer processing failed"
                    : "Trailer upload failed"}
                </p>
                <p className="mt-1 text-sm text-foreground/80">
                  {failure.message ||
                    `Something went wrong during trailer ${failure.stage === "processing" ? "processing" : "upload"}. Please try again.`}{" "}
                  Your main video is not affected.
                </p>
                {failure.requestId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reference: {failure.requestId}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={track.retry}>
                {failure.stage === "processing" ? "Re-upload trailer" : "Retry trailer upload"}
              </Button>
              <Button type="button" variant="secondary" onClick={track.clearFile}>
                Choose different trailer file
              </Button>
            </div>
          </div>
        </>
      )}

      {state.trailerId !== null && <LinkStatus track={track} titleId={titleId} />}
    </section>
  );
}
