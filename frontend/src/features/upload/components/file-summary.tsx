import { FileVideo, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProcessingBadge } from "@/features/videos/components/status-badge";
import type { ProcessingStatus } from "@/types/domain";

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Compact inset showing the chosen file, with its status chip and remove
 * control. `label` names the role of the file (for example "Main video") when
 * more than one file is on screen.
 */
export function FileSummary({
  file,
  status,
  label,
  removeLabel = "Remove file",
  onRemove,
}: {
  file: File;
  status: ProcessingStatus | null;
  label?: string;
  removeLabel?: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-media border border-border bg-surface p-4">
      <FileVideo className="shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {label && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        )}
        <p className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </p>
        <p className="text-xs text-muted-foreground">{formatMegabytes(file.size)}</p>
      </div>
      {onRemove && (
        <Button type="button" variant="ghost" size="icon" aria-label={removeLabel} onClick={onRemove}>
          <X aria-hidden="true" />
        </Button>
      )}
      {status && (
        <div className="shrink-0">
          <ProcessingBadge status={status} />
        </div>
      )}
    </div>
  );
}
