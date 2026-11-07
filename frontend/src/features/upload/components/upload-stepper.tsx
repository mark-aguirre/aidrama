import { AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UploadFailure, UploadPhase } from "../hooks/use-upload-flow";

const STEP_LABELS = ["Select", "Details", "Upload", "Process", "Publish"] as const;
const LAST_STEP_INDEX = STEP_LABELS.length - 1;

type StepState = "complete" | "active" | "upcoming" | "error";

/**
 * Index of the visible step each non-failed phase sits on. `published` is one
 * past the last step, which makes every step complete.
 */
const STEP_INDEX_BY_PHASE: Record<Exclude<UploadPhase, "failed">, number> = {
  idle: 0,
  selected: 1,
  pending: 2,
  uploading: 2,
  processing: 3,
  ready: 4,
  published: STEP_LABELS.length,
};

const UPLOAD_STEP_INDEX = 2;
const PROCESS_STEP_INDEX = 3;

const STATE_TEXT: Record<StepState, string> = {
  complete: "done",
  active: "current",
  upcoming: "not started",
  error: "error",
};

function currentStep(
  phase: UploadPhase,
  failure: UploadFailure | null,
): { index: number; errored: boolean } {
  if (phase === "failed") {
    return {
      index: failure?.at === "PROCESSING" ? PROCESS_STEP_INDEX : UPLOAD_STEP_INDEX,
      errored: true,
    };
  }
  return { index: STEP_INDEX_BY_PHASE[phase], errored: false };
}

function StepNode({ state, number }: { state: StepState; number: number }) {
  const base =
    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium sm:size-8 sm:text-sm";

  if (state === "complete") {
    return (
      <span className={cn(base, "bg-primary text-primary-foreground")}>
        <Check className="size-3.5 sm:size-4" aria-hidden="true" />
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className={cn(base, "border-2 border-destructive bg-card text-destructive")}>
        <AlertCircle className="size-3.5 sm:size-4" aria-hidden="true" />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span
        className={cn(
          base,
          "animate-pulse border-2 border-primary bg-card text-foreground motion-reduce:animate-none",
        )}
      >
        {number}
      </span>
    );
  }
  return (
    <span className={cn(base, "border border-border bg-card text-muted-foreground")}>
      {number}
    </span>
  );
}

const LABEL_CLASS: Record<StepState, string> = {
  complete: "text-foreground",
  active: "font-medium text-foreground",
  upcoming: "text-muted-foreground",
  error: "text-destructive",
};

/**
 * Five-step progress indicator projected from the eight upload phases. It is
 * status only: the flow cannot jump between steps, so nothing here is
 * interactive. It reads `phase` and `failure` and holds no state of its own.
 */
export function UploadStepper({
  phase,
  failure,
}: {
  phase: UploadPhase;
  failure: UploadFailure | null;
}) {
  const { index: current, errored } = currentStep(phase, failure);

  const states: StepState[] = STEP_LABELS.map((_, i) => {
    if (i < current) return "complete";
    if (i === current) return errored ? "error" : "active";
    return "upcoming";
  });

  const compactIndex = Math.min(current, LAST_STEP_INDEX);
  const compactSuffix = errored
    ? " — error"
    : current > LAST_STEP_INDEX
      ? " — done"
      : "";

  return (
    <nav aria-label="Upload progress">
      <ol className="flex items-start">
        {STEP_LABELS.map((label, i) => {
          const state = states[i];
          return (
            <li
              key={label}
              aria-current={state === "active" ? "step" : undefined}
              className="relative flex flex-1 flex-col items-center"
            >
              {i < LAST_STEP_INDEX && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1/2 top-3 h-0.5 w-full -translate-y-1/2 sm:top-4",
                    state === "complete" ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <StepNode state={state} number={i + 1} />
              <span
                className={cn(
                  "sr-only sm:not-sr-only sm:mt-2 sm:text-center sm:text-xs",
                  LABEL_CLASS[state],
                )}
              >
                {label}
                <span className="sr-only"> — {STATE_TEXT[state]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p
        aria-hidden="true"
        className={cn(
          "mt-3 text-center text-sm sm:hidden",
          errored ? "text-destructive" : "text-foreground",
        )}
      >
        Step {compactIndex + 1} of {STEP_LABELS.length} · {STEP_LABELS[compactIndex]}
        {compactSuffix}
      </p>
    </nav>
  );
}
