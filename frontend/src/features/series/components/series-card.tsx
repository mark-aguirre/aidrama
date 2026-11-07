import Image from "next/image";
import Link from "next/link";
import { Layers } from "lucide-react";
import type { Series } from "@/types/domain";

/** A series tile: poster, title, season/episode count. */
export function SeriesCard({ series }: { series: Series }) {
  return (
    <Link
      href={`/series/${series.slug}`}
      className="group block rounded-media focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-video overflow-hidden rounded-media bg-surface-2 ring-1 ring-border/60 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:ring-primary/70">
        {series.posterUrl ? (
          <Image
            src={series.posterUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Layers aria-hidden="true" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
          <Layers className="size-3" aria-hidden="true" />
          Series
        </span>
      </div>
      <div className="mt-3">
        <h3 className="font-display text-base leading-snug text-foreground transition-colors group-hover:text-primary line-clamp-2">
          {series.title}
        </h3>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
          <span>
            {series.seasonCount} season{series.seasonCount === 1 ? "" : "s"}
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span>{series.episodeCount} episodes</span>
        </div>
      </div>
    </Link>
  );
}
