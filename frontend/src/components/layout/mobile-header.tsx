"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { MobileNavSheet } from "./mobile-nav-sheet";

/** Tab roots show only the brand; deeper pages add the section title. */
const TAB_ROOTS: ReadonlySet<string> = new Set([
  "/",
  "/explore",
  "/search",
  "/library",
  "/studio/upload",
]);

/** Static path-to-title map. Unmapped paths show no title; the page has its own h1. */
const TITLES: Readonly<Record<string, string>> = {
  "/explore": "Browse",
  "/search": "Search",
  "/library": "Library",
  "/series": "Series",
  "/movies": "Films",
  "/shorts": "Shorts",
  "/notifications": "Notifications",
  "/studio": "Studio",
  "/studio/upload": "Upload",
  "/studio/content": "My Content",
  "/studio/analytics": "Analytics",
  "/studio/comments": "Comments",
};

/**
 * Scroll distance before the header may hide, and the movement needed to
 * react. The hide threshold is larger than the show threshold so ordinary
 * finger wobble while reading doesn't flip the header in and out (which reads
 * as scroll jank); a deliberate downward swipe still hides it promptly.
 */
const HIDE_AFTER_PX = 64;
const HIDE_DELTA_PX = 24;
const SHOW_DELTA_PX = 8;

/**
 * Hides the header while scrolling down and shows it on scroll up. Does
 * nothing when the user prefers reduced motion, so the header stays put.
 * Direction changes reset the accumulator so a short reverse swipe reacts.
 */
function useScrollHidden(): boolean {
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;
    let moved = 0;

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY;
      lastY = y;

      if (query.matches || y <= HIDE_AFTER_PX) {
        moved = 0;
        setHidden(false);
        return;
      }

      // Accumulate movement in the current direction; flip the sign on reversal.
      moved = Math.sign(moved) === Math.sign(delta) ? moved + delta : delta;

      if (moved > HIDE_DELTA_PX) {
        setHidden(true);
      } else if (moved < -SHOW_DELTA_PX) {
        setHidden(false);
      }
    }

    function onMotionPreferenceChange() {
      if (query.matches) setHidden(false);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    query.addEventListener("change", onMotionPreferenceChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      query.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);

  return hidden;
}

/**
 * Compact top bar for phones (below `lg`). The brand logo and app name always
 * show; deeper pages add the section title. The account control is on the right.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const hidden = useScrollHidden();

  const isRoot = TAB_ROOTS.has(pathname);
  const title = TITLES[pathname];

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-white/5 bg-background/60 backdrop-blur-xl transition-transform duration-150 ease-out [transform:translateZ(0)] [backface-visibility:hidden] focus-within:translate-y-0 motion-reduce:transition-none lg:hidden",
        hidden && "-translate-y-full",
      )}
    >
      <div className="flex h-14 items-center gap-1 px-4">
        <Logo className="shrink-0" />
        {!isRoot && title && (
          <span className="min-w-0 truncate pl-1 text-base font-semibold text-foreground">
            {title}
          </span>
        )}
        <div className="ml-auto -mr-2 shrink-0">
          <MobileNavSheet />
        </div>
      </div>
    </header>
  );
}
