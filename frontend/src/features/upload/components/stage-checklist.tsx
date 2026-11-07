import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ProcessingStatus } from "@/types/domain";
import { cn } from "@/lib/utils";

const STAGES: { key: ProcessingStatus; label: string }[] = [
  { key: "PENDING", label: "Queued" },
  { key: "UPLOADING", label: "Uploading" },
  { key: "PROCESSING", label: "Transcoding to HLS" },
  { key: "READY", label: "Ready to publish" },
];

/**
 * The status machine as a checklist (design 2.4). When `failedAt` is set the
 * list stops at that stage, which shows a destructive marker and "— failed".
 */
export function StageChecklist({
  status,
  failedAt,
}: {
  status: ProcessingStatus;
  failedAt?: ProcessingStatus;
}) {
  const markerIndex = STAGES.findIndex((s) => s.key === (failedAt ?? status));

  return (
    <ol className="flex flex-col gap-2" aria-label="Processing status">
      {STAGES.map((stage, i) => {
        const failed = failedAt !== undefined && i === markerIndex;
        const done = failedAt
          ? i < markerIndex
          : i < markerIndex || status === "READY";
        const active = !failedAt && i === markerIndex && status !== "READY";
        return (
          <li
            key={stage.key}
            className={cn(
              "flex items-center gap-2 text-sm",
              failed
                ? "text-destructive"
                : done
                  ? "text-success"
                  : active
                    ? "text-foreground"
                    : "text-muted-foreground",
            )}
          >
            {failed ? (
              <AlertCircle className="size-4" aria-hidden="true" />
            ) : done ? (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            ) : (
              <span
                className={cn(
                  "size-4 rounded-full border",
                  active && "animate-pulse border-primary",
                )}
                aria-hidden="true"
              />
            )}
            {stage.label}
            {failed && " — failed"}
          </li>
        );
      })}
    </ol>
  );
}
