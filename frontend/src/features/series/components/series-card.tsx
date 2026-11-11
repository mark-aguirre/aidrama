import Link from "next/link";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Series } from "@/types/domain";
import { CardMenu } from "@/features/videos/components/card-menu";
import {
  CARD_PRESS,
  COLLECTION_POSTER,
  POSTER_FRAME,
  PosterArt,
  STRETCHED_LINK,
} from "@/features/videos/components/video-card";

function seriesHref(series: Series): string {
  return `/series/${series.slug}`;
}

/** Genre, season count, and episode count, from real values only. */
function seriesMeta(series: Series): string {
  const seasons = `${series.seasonCount} ${series.seasonCount === 1 ? "season" : "seasons"}`;
  const episodes = `${series.episodeCount} ${series.episodeCount === 1 ? "episode" : "episodes"}`;
  return [series.genre || null, seasons, episodes].filter(Boolean).join(" · ");
}

/** 16:9 series poster with the "Series" tag; art is never cropped. */
function SeriesPoster({
  series,
  sizes,
  collection = false,
  className,
}: {
  series: Series;
  sizes: string;
  /** Portrait frame and a smaller tag below `lg`. */
  collection?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(POSTER_FRAME, collection && COLLECTION_POSTER, className)}
    >
      {series.posterUrl ? (
        <PosterArt src={series.posterUrl} sizes={sizes} />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Layers aria-hidden="true" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
      <span
        className={cn(
          "absolute bottom-2.5 left-2.5 flex items-center gap-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white",
          collection &&
            "max-lg:bottom-1.5 max-lg:left-1.5 max-lg:gap-1 max-lg:px-1 max-lg:text-[10px]",
        )}
      >
        <Layers className="size-3" aria-hidden="true" />
        Series
      </span>
    </div>
  );
}

/**
 * A series tile in the grid layout, styled like the video cards: the title
 * link is stretched over the tile, and the ⋮ menu sits beside the title.
 * Below `lg` it is a portrait collection tile: two-line title, no meta line,
 * no ⋮ menu (too narrow in a 3-column grid).
 */
export function SeriesCard({ series }: { series: Series }) {
  const href = seriesHref(series);

  return (
    <article className={cn("group relative", CARD_PRESS)}>
      <SeriesPoster
        series={series}
        collection
        sizes="(max-width: 640px) 34vw, (max-width: 1023px) 24vw, 340px"
        className="group-hover:-translate-y-1"
      />
      <div className="mt-2.5 flex items-start gap-1 max-lg:mt-1.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary max-lg:break-words max-lg:text-xs max-lg:leading-snug lg:line-clamp-1">
            <Link href={href} className={STRETCHED_LINK}>
              {series.title}
            </Link>
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground tabular-nums max-lg:hidden">
            {seriesMeta(series)}
          </p>
        </div>
        <CardMenu
          title={series.title}
          href={href}
          openLabel="View series"
          className="-mr-2 max-lg:hidden"
        />
      </div>
    </article>
  );
}

/** A series in the list layout: poster left, details and description right. */
export function SeriesRow({ series }: { series: Series }) {
  const href = seriesHref(series);

  return (
    <article className="group relative -mx-2 flex gap-4 rounded-media p-2 transition-colors hover:bg-surface sm:gap-5">
      <SeriesPoster
        series={series}
        sizes="(max-width: 640px) 160px, 288px"
        className="w-40 shrink-0 sm:w-72"
      />
      <div className="flex min-w-0 flex-1 items-start gap-1 py-0.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary sm:text-base">
            <Link href={href} className={STRETCHED_LINK}>
              {series.title}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground tabular-nums">
            {seriesMeta(series)}
          </p>
          {series.creator.displayName && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {series.creator.displayName}
            </p>
          )}
          {series.description && (
            <p className="mt-2 hidden text-sm text-foreground/70 sm:line-clamp-2">
              {series.description}
            </p>
          )}
        </div>
        <CardMenu title={series.title} href={href} openLabel="View series" />
      </div>
    </article>
  );
}
