"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bookmark,
  Clapperboard,
  Compass,
  House,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useSignIn } from "@/features/auth/components/sign-in-provider";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Guests are asked to sign in first; the destination still enforces auth. */
  requiresAuth: boolean;
  /** Paths starting with this prefix count as being in the tab's section. */
  activePrefix?: string;
}

const TABS: readonly Tab[] = [
  { href: "/", label: "Home", icon: House, requiresAuth: false },
  { href: "/explore", label: "Browse", icon: Compass, requiresAuth: false },
  { href: "/search", label: "Search", icon: Search, requiresAuth: false },
  { href: "/library", label: "Library", icon: Bookmark, requiresAuth: true },
  {
    href: "/studio/upload",
    label: "Create",
    icon: Clapperboard,
    requiresAuth: true,
    activePrefix: "/studio",
  },
];

function isActive(tab: Tab, pathname: string): boolean {
  if (tab.href === "/") return pathname === "/";
  return pathname.startsWith(tab.activePrefix ?? tab.href);
}

function tabClassName(active: boolean): string {
  return cn(
    "relative flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] leading-none transition-colors active:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
  );
}

function TabContent({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <>
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-primary"
        />
      )}
      <tab.icon className="size-5" aria-hidden="true" />
      {tab.label}
    </>
  );
}

/**
 * Fixed bottom navigation for phones (below `lg`). Library and Create stay
 * visible for guests; tapping them opens the inline sign-in panel and, once
 * signed in, continues to the tab. While the session is still restoring they
 * link straight to the tab, whose page enforces sign-in.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useRestoredSession();
  const signIn = useSignIn();
  const anonymous = session.status === "anonymous";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(tab, pathname);
          return (
            <li key={tab.href}>
              {tab.requiresAuth && anonymous ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() =>
                    signIn.open({ onSuccess: () => router.push(tab.href) })
                  }
                  className={tabClassName(active)}
                >
                  <TabContent tab={tab} active={active} />
                </button>
              ) : (
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={tabClassName(active)}
                >
                  <TabContent tab={tab} active={active} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
