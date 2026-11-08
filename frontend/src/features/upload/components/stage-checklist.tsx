import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ProcessingStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const STAGES: { key: ProcessingStatus; label: string }[] = [
  { key: "PENDING", label: "Queued" },
  { key: "UPLOADING", label: "Uploading" },
  { key: "PROCESSING", label: "Transcoding" },
  { key: "READY", label: "Ready to publish" },
];

/**
 * The status machine as a checklist (design 2.4). When `failedAt` is set the
 * list stops at that stage, which shows a destructive marker and "failed".
 */
export function StageChecklist({
  status,
  failedAt,
}: {
  status: ProcessingStatus;
  failedAt?: ProcessingStatus;
}) {
  const markerIndex = STAGES.findIndex((stage) => stage.key === (failedAt ?? status));

  return (
    <ol className="grid gap-2 sm:grid-cols-4 sm:gap-3" aria-label="Processing status">
      {STAGES.map((stage, index) => {
        const failed = failedAt !== undefined && index === markerIndex;
        const done = failedAt
          ? index < markerIndex
          : index < markerIndex || status === "READY";
        const active = !failedAt && index === markerIndex && status !== "READY";
        return (
          <li
            key={stage.key}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs sm:flex-col sm:items-start sm:gap-1.5 sm:px-0",
              failed
                ? "text-destructive"
                : done
                  ? "text-success"
                  : active
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
            )}
          >
            {failed ? (
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            ) : done ? (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <span
                className={cn(
                  "size-4 shrink-0 rounded-full border",
                  active && "border-primary bg-primary/15 ring-2 ring-primary/10",
                )}
                aria-hidden="true"
              />
            )}
            <span>{stage.label}{failed && ", failed"}</span>
          </li>
        );
      })}
    </ol>
  );
}
