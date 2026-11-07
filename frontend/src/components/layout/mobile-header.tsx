"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { MobileNavSheet } from "./mobile-nav-sheet";

/** Tab roots show the brand header; every other path shows back + title. */
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

/** Scroll distance before the header may hide, and the movement needed to react. */
const HIDE_AFTER_PX = 64;
const SCROLL_DELTA_PX = 6;

/** Where Back goes when there is no history to return to (deep link). */
function backFallback(pathname: string): string {
  return pathname.startsWith("/studio") ? "/studio" : "/";
}

/**
 * Hides the header while scrolling down and shows it on scroll up. Does
 * nothing when the user prefers reduced motion, so the header stays put.
 */
function useScrollHidden(): boolean {
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;

    function onScroll() {
      const y = window.scrollY;
      const delta = y - lastY;
      if (query.matches || y <= HIDE_AFTER_PX) {
        setHidden(false);
      } else if (delta > SCROLL_DELTA_PX) {
        setHidden(true);
      } else if (delta < -SCROLL_DELTA_PX) {
        setHidden(false);
      } else {
        return;
      }
      lastY = y;
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
 * Compact top bar for phones (below `lg`). Tab roots show the logo; deeper
 * pages show a Back button and the section title. The account control is on
 * the right in both.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const hidden = useScrollHidden();

  const isRoot = TAB_ROOTS.has(pathname);
  const title = TITLES[pathname];

  function goBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(backFallback(pathname));
    }
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-white/5 bg-background/60 backdrop-blur-xl transition-transform duration-200 focus-within:translate-y-0 motion-reduce:transition-none lg:hidden",
        hidden && "-translate-y-full",
      )}
    >
      <div className="flex h-14 items-center gap-1 px-4">
        {isRoot ? (
          <Logo />
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2 size-11"
              aria-label="Go back"
              onClick={goBack}
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </Button>
            {title && (
              <span className="min-w-0 truncate text-base font-semibold text-foreground">
                {title}
              </span>
            )}
          </>
        )}
        <div className="ml-auto -mr-2 shrink-0">
          <MobileNavSheet />
        </div>
      </div>
    </header>
  );
}
