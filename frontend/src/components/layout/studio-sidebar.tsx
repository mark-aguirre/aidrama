"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import {
  BarChart3,
  LayoutDashboard,
  MessageSquare,
  Upload,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/studio", label: "Overview", icon: LayoutDashboard },
  { href: "/studio/content", label: "My Content", icon: Video },
  { href: "/studio/upload", label: "Upload", icon: Upload },
  { href: "/studio/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/studio/comments", label: "Comments", icon: MessageSquare },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/studio") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Creator Studio navigation (spec 4.2). */
export function StudioSidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Creator Studio"
      className="hidden w-60 shrink-0 border-r border-border/60 bg-surface/40 lg:block"
    >
      <div className="sticky top-0 flex h-screen flex-col gap-6 p-5">
        <div className="px-2">
          <Logo />
          <p className="mt-1 pl-10 text-xs text-muted-foreground">
            Creator Studio
          </p>
        </div>
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-4", active && "text-primary")}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
