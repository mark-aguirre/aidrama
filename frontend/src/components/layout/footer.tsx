import Link from "next/link";
import { Logo } from "./logo";

const links = [
  { href: "/explore", label: "Browse" },
  { href: "/series", label: "Series" },
  { href: "/movies", label: "Films" },
  { href: "/shorts", label: "Shorts" },
];

/**
 * Site footer, matched to the landing mockup. Desktop only: below `lg` the
 * app runs as an installed-app shell, where a footer costs a quarter of the
 * screen to repeat the header's brand and four links that the bottom tab bar
 * and the profile screen already carry.
 */
export function Footer() {
  return (
    <footer className="mt-16 hidden border-t border-white/5 lg:block">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-6 px-4 py-8 sm:px-8 md:flex-row md:items-center">
        <div className="flex items-center gap-6">
          <Logo />
          <p className="hidden text-xs text-muted-foreground sm:block">
            Stories made with imagination
          </p>
        </div>
        <nav
          aria-label="Footer"
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground md:ml-auto"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
