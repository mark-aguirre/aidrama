"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark, House, User, Zap, type LucideIcon } from "lucide-react";
import { useSignIn } from "@/features/auth/components/sign-in-provider";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Guests are asked to sign in first; the destination still enforces auth. */
  requiresAuth: boolean;
  /** Path prefixes that count as being inside this tab's section. */
  sections: readonly string[];
}

const TABS: readonly Tab[] = [
  { href: "/", label: "Home", icon: House, requiresAuth: false, sections: [] },
  {
    href: "/shorts",
    label: "Shorts",
    icon: Zap,
    requiresAuth: false,
    sections: ["/shorts"],
  },
  {
    href: "/library",
    label: "My List",
    icon: Bookmark,
    requiresAuth: true,
    sections: ["/library"],
  },
  {
    // Profile also owns the screens it links to: Studio and notifications.
    href: "/profile",
    label: "Profile",
    icon: User,
    requiresAuth: true,
    sections: ["/profile", "/studio", "/notifications"],
  },
];

function isActive(tab: Tab, pathname: string): boolean {
  if (tab.href === "/") return pathname === "/";
  return tab.sections.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function tabClassName(active: boolean): string {
  return cn(
    "flex min-h-14 w-full flex-col items-center justify-center gap-1 text-[11px] leading-none transition-[color,transform,opacity] duration-150 ease-out active:scale-[0.96] active:opacity-70 motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    active ? "font-semibold text-primary" : "font-medium text-muted-foreground",
  );
}

function TabContent({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <>
      <tab.icon
        className={cn("size-6", active && "fill-current stroke-background")}
        strokeWidth={active ? 2 : 1.75}
        aria-hidden="true"
      />
      {tab.label}
    </>
  );
}

/**
 * Fixed bottom navigation for phones (below `lg`). My List and Profile stay
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
      <ul className="grid grid-cols-4">
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
