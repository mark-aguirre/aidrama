/** Labelled determinate progress bar for a browser-to-storage upload. */
export function UploadProgress({
  percent,
  label = "Uploading",
  ariaLabel = "Upload progress",
}: {
  percent: number;
  label?: string;
  ariaLabel?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{percent}%</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-primary transition-all motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
