"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Browse" },
  { href: "/series", label: "Series" },
  { href: "/movies", label: "Films" },
  { href: "/shorts", label: "Shorts" },
];

/** Primary nav links with a pink underline on the active route. */
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
      {links.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative py-5 text-sm transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
            {active && (
              <span className="absolute inset-x-0 bottom-3 h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
