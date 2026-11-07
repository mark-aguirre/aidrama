import Link from "next/link";
import { LayoutGrid, type LucideIcon } from "lucide-react";
import { ScrollRail } from "@/components/shared/scroll-rail";
import { cn } from "@/lib/utils";
import { GENRE_ICONS } from "../genre-icons";

const tileGenres: { genre: string; label: string }[] = [
  { genre: "Romance", label: "Romance" },
  { genre: "Action", label: "Action" },
  { genre: "Fantasy", label: "Fantasy" },
  { genre: "Science Fiction", label: "Sci-Fi" },
  { genre: "Thriller", label: "Thriller" },
  { genre: "Comedy", label: "Comedy" },
  { genre: "Historical", label: "Historical" },
  { genre: "Drama", label: "Drama" },
  { genre: "Horror", label: "Horror" },
  { genre: "Mystery", label: "Mystery" },
  { genre: "Animation", label: "Animation" },
];

const tiles: { genre: string | null; label: string; icon: LucideIcon }[] = [
  { genre: null, label: "All", icon: LayoutGrid },
  ...tileGenres.map((t) => ({ ...t, icon: GENRE_ICONS[t.genre] })),
];

/** Icon tiles that jump into Browse filtered by genre (spec 3.15). */
export function GenreTiles({ active = null }: { active?: string | null }) {
  return (
    <ScrollRail label="Genres" className="gap-3">
      {tiles.map(({ genre, label, icon: Icon }) => {
        const isActive = genre === active;
        return (
          <Link
            key={label}
            href={genre ? `/explore?genre=${encodeURIComponent(genre)}` : "/explore"}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "flex w-[92px] shrink-0 snap-start flex-col items-center gap-2 rounded-lg border px-3 py-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "border-primary bg-primary/10 text-foreground"
                : "border-white/5 bg-surface text-muted-foreground hover:border-white/15 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-5", isActive ? "text-primary" : "text-foreground/80")}
              aria-hidden="true"
            />
            {label}
          </Link>
        );
      })}
    </ScrollRail>
  );
}
