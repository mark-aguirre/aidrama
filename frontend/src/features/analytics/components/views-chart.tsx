import type { AnalyticsPoint } from "@/types/domain";

/**
 * A minimal views-over-time bar chart (spec 3.22).
 * Pure CSS bars — no charting dependency — with accessible labels.
 */
export function ViewsChart({ data }: { data: AnalyticsPoint[] }) {
  const max = Math.max(...data.map((d) => d.views), 1);

  return (
    <figure>
      <figcaption className="sr-only">
        Daily views over the last {data.length} days
      </figcaption>
      <div
        className="flex h-48 items-end gap-1.5"
        role="img"
        aria-label={`Views ranged from ${Math.min(
          ...data.map((d) => d.views),
        )} to ${max} over ${data.length} days.`}
      >
        {data.map((d) => (
          <div
            key={d.date}
            className="group relative flex-1"
            style={{ height: "100%" }}
          >
            <div
              className="absolute bottom-0 w-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: `${(d.views / max) * 100}%` }}
            />
            <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-popover px-1.5 py-0.5 text-[11px] text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100 tabular-nums">
              {d.views.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </figure>
  );
}
