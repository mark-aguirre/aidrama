"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RequireCreator } from "@/features/auth/components/require-creator";
import { cn } from "@/lib/utils";
import type { ProcessingStatus } from "@/types/domain";
import { useTrailerUpload } from "../hooks/use-trailer-upload";
import { useUploadFlow, type UploadPhase } from "../hooks/use-upload-flow";
import { CREATABLE_TYPES, type UploadDetails } from "../schemas";
import { DropZone } from "./drop-zone";
import { FileSummary } from "./file-summary";
import { PublishForm } from "./publish-form";
import { StageChecklist } from "./stage-checklist";
import { TrailerSection } from "./trailer-section";
import { UploadDetailsForm } from "./upload-details-form";
import { UploadFailurePanel } from "./upload-failure-panel";
import { UploadProgress } from "./upload-progress";
import { UploadStepper } from "./upload-stepper";

const STATUS_BY_PHASE: Record<
  Exclude<UploadPhase, "idle" | "selected">,
  ProcessingStatus
> = {
  pending: "PENDING",
  uploading: "UPLOADING",
  processing: "PROCESSING",
  ready: "READY",
  published: "READY",
  failed: "FAILED",
};

const ANNOUNCEMENT: Partial<Record<UploadPhase, string>> = {
  pending: "Preparing your upload.",
  uploading: "Uploading your video.",
  processing: "Upload complete. Processing has started.",
  ready: "Your video is ready to publish.",
  published: "Your video is published.",
};

/**
 * Phases that move keyboard focus to the step heading when entered. Moves
 * happen on user-initiated and terminal transitions only; the live region
 * covers the automatic pending, uploading and processing transitions.
 */
const FOCUS_HEADING_PHASES: ReadonlySet<UploadPhase> = new Set([
  "idle",
  "selected",
  "ready",
  "published",
  "failed",
]);

/** Step heading. Focusable by script so the wizard can land focus on it. */
function StepHeading({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      tabIndex={-1}
      className={cn(
        "rounded-sm font-display text-lg text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Upload wizard (spec 3.7): pick a file, describe it, upload it to signed
 * storage, watch processing, then publish. Every phase of the design's state
 * matrix is rendered here; the orchestration lives in `useUploadFlow`.
 *
 * An optional trailer rides alongside as an independent track
 * (`useTrailerUpload`): it uploads in parallel, links itself to the main video,
 * and never gates the main phases or publishing.
 */
export function UploadWizard() {
  return (
    <RequireCreator>
      <WizardBody />
    </RequireCreator>
  );
}

function WizardBody() {
  const flow = useUploadFlow();
  const { state } = flow;
  const { phase, file, details, failure } = state;
  const trailer = useTrailerUpload(state.videoId);

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const previousPhase = React.useRef(phase);
  React.useEffect(() => {
    if (previousPhase.current === phase) return;
    previousPhase.current = phase;
    if (FOCUS_HEADING_PHASES.has(phase)) headingRef.current?.focus();
  }, [phase]);

  const status = phase === "idle" || phase === "selected" ? null : STATUS_BY_PHASE[phase];
  const draftExists = state.videoId !== null;
  const typeLabel = CREATABLE_TYPES.find((t) => t.value === details?.type)?.label;

  const failureReason = phase === "failed" ? failure : null;

  // A trailer cannot have its own trailer, so the track is off for Trailer uploads.
  const trailerAllowed = details?.type !== "TRAILER";
  const trailerSection =
    trailerAllowed && (phase === "selected" || trailer.engaged) ? (
      <TrailerSection
        track={trailer}
        titleId={state.videoId}
        deferred={phase === "selected"}
      />
    ) : null;
  // Name the main file only when a second file is on screen.
  const mainLabel = trailerAllowed && trailer.engaged ? "Main video" : undefined;

  /** Start the main upload and, in parallel, the trailer if one was attached. */
  const startUpload = (next: UploadDetails) => {
    void flow.start(next);
    if (next.type !== "TRAILER") trailer.begin(next);
  };

  const resetAll = () => {
    flow.reset();
    trailer.reset();
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95">
      <CardHeader className="border-b border-border/70 bg-surface-2/25 p-5 sm:p-6">
        <UploadStepper phase={phase} failure={failure} />
      </CardHeader>

      <CardContent className="flex flex-col gap-6 p-5 sm:gap-7 sm:p-6">
        <p role="status" aria-live="polite" className="sr-only">
          {phase === "failed"
            ? failure?.stage === "processing"
              ? "Processing failed."
              : "Upload failed."
            : (ANNOUNCEMENT[phase] ?? "")}
        </p>

        {!file && (
          <>
            <StepHeading ref={headingRef}>Choose your video</StepHeading>
            <div className="flex flex-col gap-3">
              <DropZone onFile={flow.pickFile} invalid={Boolean(state.fileError)} />
              {state.fileError && (
                <p role="alert" className="text-sm text-destructive">
                  {state.fileError}
                </p>
              )}
            </div>
          </>
        )}

        {file && phase === "selected" && (
          <>
            <StepHeading ref={headingRef}>Add details</StepHeading>
            <FileSummary
              file={file}
              status={null}
              label={mainLabel}
              onRemove={flow.clearFile}
            />
          </>
        )}

        {state.notice && phase === "selected" && (
          <p role="status" className="text-sm text-muted-foreground">
            {state.notice}
          </p>
        )}

        {file && phase === "selected" &&
          (draftExists && details ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                {details.title}
                {typeLabel && <> · {typeLabel}</>}. Details are saved with your
                draft video.
              </p>
              {trailerSection}
              <Button className="w-full sm:w-auto" onClick={() => startUpload(details)}>
                Start upload
              </Button>
            </div>
          ) : (
            <UploadDetailsForm
              key={`${file.name}-${file.size}`}
              filename={file.name}
              initial={details}
              trailerSlot={trailerSection}
              onSubmit={startUpload}
            />
          ))}

        {file && phase === "pending" && (
          <>
            <StepHeading ref={headingRef}>Starting upload</StepHeading>
            <FileSummary file={file} status={null} label={mainLabel} />
            <p className="text-sm text-muted-foreground">Getting things ready…</p>
          </>
        )}

        {file && phase === "uploading" && (
          <>
            <StepHeading ref={headingRef}>Uploading</StepHeading>
            <FileSummary file={file} status={null} label={mainLabel} />
            <UploadProgress
              percent={state.progress}
              label={mainLabel ? "Uploading main video" : "Uploading"}
              ariaLabel={mainLabel ? "Main video upload progress" : "Upload progress"}
            />
          </>
        )}

        {file && phase === "processing" && (
          <>
            <StepHeading ref={headingRef}>Processing</StepHeading>
            <FileSummary file={file} status={null} label={mainLabel} />
            <div className="flex flex-col gap-3 rounded-media border border-border/70 bg-surface-2/45 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Loader2
                  className="size-4 animate-spin text-primary motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Transcoding your video
                {flow.statusQuery.percent > 0 && (
                  <span className="tabular-nums text-muted-foreground">
                    {flow.statusQuery.percent}%
                  </span>
                )}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                This can take a few minutes. You can leave this page while it finishes.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>Processing started.</span>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/studio/content">View in My Content</Link>
                </Button>
              </div>
              {flow.statusQuery.error && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center gap-3 text-sm text-destructive"
                >
                  We couldn&apos;t check the processing status.
                  <Button variant="secondary" size="sm" onClick={flow.statusQuery.retry}>
                    Check again
                  </Button>
                </div>
              )}
            </div>
          </>
        )}

        {file && phase === "ready" && (
          <>
            <StepHeading ref={headingRef}>Ready to publish</StepHeading>
            <FileSummary file={file} status={null} label={mainLabel} />
          </>
        )}

        {file && phase === "published" && state.published && (
          <>
            <StepHeading ref={headingRef}>Published</StepHeading>
            <FileSummary file={file} status={null} label={mainLabel} />
          </>
        )}

        {file && phase === "failed" && (
          <FileSummary file={file} status={null} label={mainLabel} />
        )}

        {status &&
          (phase === "pending" ||
            phase === "uploading" ||
            phase === "processing" ||
            phase === "failed") && (
            <StageChecklist
              status={status}
              failedAt={failureReason ? failureReason.at : undefined}
            />
          )}

        {(phase === "pending" || phase === "uploading") && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Cancel upload"
            className="self-start text-destructive hover:text-destructive"
            onClick={flow.cancel}
          >
            Cancel upload
          </Button>
        )}

        {failureReason && file && details && (
          <UploadFailurePanel
            failure={failureReason}
            headingRef={headingRef}
            onRetry={() => flow.start(details)}
            onChooseDifferent={flow.clearFile}
          />
        )}

        {phase !== "idle" && phase !== "selected" && trailerSection}

        {phase === "ready" && state.videoId && (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Your video is ready to publish.
            </p>
            <PublishForm
              videoId={state.videoId}
              idPrefix="wizard-publish"
              onPublished={flow.published}
            />
            <Button variant="secondary" className="w-full sm:w-auto sm:self-start" onClick={resetAll}>
              Upload another
            </Button>
          </div>
        )}

        {phase === "published" && state.published && (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-base font-medium text-success">
              <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
              <span>
                Published. &ldquo;{state.published.title}&rdquo; is live.
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/watch/${state.published.slug}`}>Watch now</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/studio/content">View in My Content</Link>
              </Button>
              <Button variant="secondary" onClick={resetAll}>
                Upload another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
