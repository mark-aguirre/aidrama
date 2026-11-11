"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Horizontal rail with previous/next buttons, used for card rows and the
 * genre tiles. Buttons only show when there is more content that way.
 */
export function ScrollRail({
  children,
  label,
  className,
}: {
  children: React.ReactNode;
  label: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = React.useState(false);
  const [canNext, setCanNext] = React.useState(false);

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  function scroll(direction: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        className={cn(
          // `overflow-x-auto` also clips vertically, which would cut the top
          // off a card that lifts on hover and clip focus rings. The padding
          // gives them room; the matching negative margin cancels it out, so
          // the rail still lines up with everything above and below it.
          "no-scrollbar -mx-1.5 -my-3 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain scroll-px-1.5 px-1.5 py-3 scroll-smooth",
          className,
        )}
      >
        {children}
      </div>

      {canPrev && (
        <RailButton side="left" onClick={() => scroll(-1)} label="Scroll left">
          <ChevronLeft aria-hidden="true" />
        </RailButton>
      )}
      {canNext && (
        <RailButton side="right" onClick={() => scroll(1)} label="Scroll right">
          <ChevronRight aria-hidden="true" />
        </RailButton>
      )}
    </div>
  );
}

function RailButton({
  side,
  onClick,
  label,
  children,
}: {
  side: "left" | "right";
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-background/80 text-foreground backdrop-blur transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex [&_svg]:size-5",
        side === "left" ? "-left-4" : "-right-4",
      )}
    >
      {children}
    </button>
  );
}
