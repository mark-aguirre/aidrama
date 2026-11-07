import Link from "next/link";
import {
  Clapperboard,
  Drama,
  Feather,
  Ghost,
  Heart,
  Landmark,
  LayoutGrid,
  Orbit,
  Puzzle,
  Sparkles,
  Swords,
  Theater,
  type LucideIcon,
} from "lucide-react";
import { ScrollRail } from "@/components/shared/scroll-rail";
import { cn } from "@/lib/utils";

const tiles: { genre: string | null; label: string; icon: LucideIcon }[] = [
  { genre: null, label: "All", icon: LayoutGrid },
  { genre: "Romance", label: "Romance", icon: Heart },
  { genre: "Action", label: "Action", icon: Swords },
  { genre: "Fantasy", label: "Fantasy", icon: Feather },
  { genre: "Science Fiction", label: "Sci-Fi", icon: Orbit },
  { genre: "Thriller", label: "Thriller", icon: Drama },
  { genre: "Comedy", label: "Comedy", icon: Theater },
  { genre: "Historical", label: "Historical", icon: Landmark },
  { genre: "Drama", label: "Drama", icon: Clapperboard },
  { genre: "Horror", label: "Horror", icon: Ghost },
  { genre: "Mystery", label: "Mystery", icon: Puzzle },
  { genre: "Animation", label: "Animation", icon: Sparkles },
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
