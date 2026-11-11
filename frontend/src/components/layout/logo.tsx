import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Brand mark: pink play tile plus the wordmark.
 *
 * `wordmarkClassName` tunes the "AI Drama" text. `tagline` stacks a short,
 * small line beneath the wordmark (used by the mobile header).
 */
export function Logo({
  className,
  wordmarkClassName,
  tagline,
}: {
  className?: string;
  wordmarkClassName?: string;
  tagline?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="AI Drama home"
      className={cn(
        "flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff5a7e] to-[#d1245a]">
        <Play className="size-4 fill-white text-white" aria-hidden="true" />
      </span>
      {tagline ? (
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              "text-lg font-bold leading-5 tracking-tight text-foreground",
              wordmarkClassName,
            )}
          >
            AI Drama
          </span>
          <span className="mt-0.5 truncate text-[9px] font-medium uppercase leading-3 tracking-[0.2em] text-muted-foreground">
            {tagline}
          </span>
        </span>
      ) : (
        <span
          className={cn(
            "text-xl font-bold tracking-tight text-foreground",
            wordmarkClassName,
          )}
        >
          AI Drama
        </span>
      )}
    </Link>
  );
}
