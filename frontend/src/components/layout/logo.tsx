import Link from "next/link";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Brand mark: pink play tile plus the wordmark.
 *
 * `wordmarkClassName` tunes the "AI Drama" text (e.g. hide it on cramped
 * mobile headers that already show a back button and page title).
 */
export function Logo({
  className,
  wordmarkClassName,
}: {
  className?: string;
  wordmarkClassName?: string;
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
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#ff5a7e] to-[#d1245a]">
        <Play className="size-4 fill-white text-white" aria-hidden="true" />
      </span>
      <span
        className={cn(
          "text-xl font-bold tracking-tight text-foreground",
          wordmarkClassName,
        )}
      >
        AI Drama
      </span>
    </Link>
  );
}
