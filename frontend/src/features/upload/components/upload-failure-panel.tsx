import type { Ref } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UploadFailure } from "../hooks/use-upload-flow";

/**
 * Failure surface (design 2.3): states what failed and why. The API's reason
 * is shown as given; when there is none, a plain fallback replaces it so the
 * panel is never blank. Retry is the first focusable control. Its heading is
 * the step heading for the failed phase, so the wizard can focus it through
 * `headingRef`.
 */
export function UploadFailurePanel({
  failure,
  headingRef,
  onRetry,
  onChooseDifferent,
}: {
  failure: UploadFailure;
  headingRef?: Ref<HTMLHeadingElement>;
  onRetry: () => void;
  onChooseDifferent: () => void;
}) {
  const isProcessing = failure.stage === "processing";
  const heading = isProcessing ? "Processing failed" : "Upload failed";
  const reason =
    failure.message ||
    `Something went wrong during ${isProcessing ? "processing" : "upload"}. Please try again.`;

  return (
    <div
      role="alert"
      className="rounded-media border border-destructive/40 bg-destructive/10 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm font-display text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {heading}
          </h2>
          <p className="mt-1 text-sm text-foreground/80">{reason}</p>
          {failure.requestId && (
            <p className="mt-1 text-xs text-muted-foreground">
              Reference: {failure.requestId}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onRetry}>{isProcessing ? "Re-upload" : "Retry upload"}</Button>
        <Button variant="secondary" onClick={onChooseDifferent}>
          Choose different file
        </Button>
      </div>
    </div>
  );
}
