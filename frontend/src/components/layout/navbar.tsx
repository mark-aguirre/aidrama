import { Suspense } from "react";
import Link from "next/link";
import { Bell, Bookmark, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { NavAuth } from "./nav-auth";
import { NavLinks } from "./nav-links";

/** Top navigation (spec 4.1), styled after the approved landing mockup. */
export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-background/60 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-8 px-4 sm:px-8">
        <Logo />

        {/* usePathname needs a Suspense boundary under cacheComponents. */}
        <Suspense fallback={<div className="hidden flex-1 lg:block" />}>
          <NavLinks />
        </Suspense>

        <div className="ml-auto flex items-center gap-2">
          <form
            action="/search"
            role="search"
            className="relative hidden md:block"
          >
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              name="q"
              aria-label="Search dramas, characters, or creators"
              placeholder="Search dramas, characters, or creators…"
              className="h-10 w-64 rounded-full border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:w-80"
            />
          </form>

          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Search"
            className="md:hidden"
          >
            <Link href="/search">
              <Search aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="My Library"
            className="hidden sm:inline-flex"
          >
            <Link href="/library">
              <Bookmark aria-hidden="true" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            asChild
            aria-label="Notifications"
            className="hidden sm:inline-flex"
          >
            <Link href="/notifications">
              <Bell aria-hidden="true" />
            </Link>
          </Button>

          <NavAuth />
        </div>
      </div>
    </header>
  );
}
