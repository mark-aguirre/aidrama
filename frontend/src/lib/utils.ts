import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional class names and de-duplicate conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format a duration in seconds as `h:mm:ss` or `m:ss`. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Format a view count compactly, e.g. 25000 -> "25K". */
export function formatViews(views: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(views);
}

/** Format an ISO timestamp as a short readable date. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format a count with its noun, e.g. `formatCount(1, "title", "titles")` -> "1 title". */
export function formatCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${new Intl.NumberFormat("en").format(count)} ${count === 1 ? singular : plural}`;
}
