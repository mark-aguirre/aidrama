import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Rail and section title with an optional "See all" link. */
export function SectionHeader({
  title,
  description,
  href,
  linkLabel = "See all",
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-xl text-foreground sm:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {href && (
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-sm text-foreground/80 transition-colors hover:text-primary max-lg:-my-3 max-lg:py-3 max-lg:pl-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
