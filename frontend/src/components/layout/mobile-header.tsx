"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Search, type LucideIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

/** Short line under the wordmark, taken from the product description. */
const BRAND_TAGLINE = "Watch, create, share";

/** Tab roots show the brand and tagline; deeper pages add the section title. */
const TAB_ROOTS: ReadonlySet<string> = new Set([
  "/",
  "/shorts",
  "/library",
  "/profile",
]);

/** Static path-to-title map. Unmapped paths show no title; the page has its own h1. */
const TITLES: Readonly<Record<string, string>> = {
  "/explore": "Browse",
  "/search": "Search",
  "/series": "Series",
  "/movies": "Films",
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
    // Below `lg` <body> is the scroll region (see globals.css); the header is
    // hidden at `lg` and up, so nothing needs to listen to the window there.
    const scroller = document.body;
    let lastY = scroller.scrollTop;
    let moved = 0;

    function onScroll() {
      const y = scroller.scrollTop;
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

    scroller.addEventListener("scroll", onScroll, { passive: true });
    query.addEventListener("change", onMotionPreferenceChange);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      query.removeEventListener("change", onMotionPreferenceChange);
    };
  }, []);

  return hidden;
}

function HeaderIconLink({
  href,
  label,
  icon: Icon,
  current,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className="flex size-11 items-center justify-center rounded-full text-foreground transition-[transform,opacity] duration-150 ease-out active:scale-90 active:opacity-70 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-6" aria-hidden="true" />
    </Link>
  );
}

/**
 * Compact top bar for phones (below `lg`). The brand logo and app name always
 * show (with a short tagline on tab roots); deeper pages add the section
 * title. Search and notifications sit on the right. The bell shows no unread
 * dot: notifications are still mock data, so there is no real count to show.
 */
export function MobileHeader() {
  const pathname = usePathname();
  const hidden = useScrollHidden();

  const isRoot = TAB_ROOTS.has(pathname);
  const title = TITLES[pathname];

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-white/5 bg-background/60 pt-[env(safe-area-inset-top)] backdrop-blur-xl transition-transform duration-150 ease-out [transform:translateZ(0)] [backface-visibility:hidden] focus-within:translate-y-0 motion-reduce:transition-none lg:hidden",
        hidden && "-translate-y-full",
      )}
    >
      <div className="flex h-14 items-center gap-1 px-4">
        <Logo
          className="min-w-0 shrink"
          tagline={isRoot ? BRAND_TAGLINE : undefined}
        />
        {!isRoot && title && (
          <span className="min-w-0 truncate pl-1 text-base font-semibold text-foreground">
            {title}
          </span>
        )}
        <div className="-mr-2.5 ml-auto flex shrink-0 items-center">
          <HeaderIconLink
            href="/search"
            label="Search"
            icon={Search}
            current={pathname === "/search"}
          />
          <HeaderIconLink
            href="/notifications"
            label="Notifications"
            icon={Bell}
            current={pathname === "/notifications"}
          />
        </div>
      </div>
    </header>
  );
}
