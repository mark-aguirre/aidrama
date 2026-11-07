import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { cn, formatDuration, formatViews } from "@/lib/utils";
import type { Video } from "@/types/domain";
import { CardMenu } from "./card-menu";

function watchHref(video: Video): string {
  return `/watch/${video.slug}`;
}

/** Season/episode position when known, otherwise a plain "Episode" marker. */
function episodeLabel(video: Video): string | null {
  if (video.type !== "EPISODE") return null;
  const { seasonNumber, episodeNumber } = video;
  if (seasonNumber !== null && episodeNumber !== null) {
    return `S${seasonNumber} E${episodeNumber}`;
  }
  return "Episode";
}

/** Genre, episode position, and views, from real values only. */
function videoMeta(video: Video): string {
  const views =
    video.viewCount > 0
      ? `${formatViews(video.viewCount)} ${video.viewCount === 1 ? "view" : "views"}`
      : null;
  return [video.genre || null, episodeLabel(video), views]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The title link stretched over the whole card with `::after`, so the card is
 * one click target while the ⋮ menu (z-10) can sit inside it as a sibling
 * instead of an invalid button-in-link. The focus ring is drawn on the
 * stretched area so it outlines the card, as before.
 */
export const STRETCHED_LINK =
  "outline-none after:absolute after:inset-0 after:rounded-media focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-4 focus-visible:after:ring-offset-background";

/** Ring and hover treatment shared by every 16:9 poster frame. */
export const POSTER_FRAME =
  "relative aspect-video overflow-hidden rounded-media bg-surface-2 ring-1 ring-white/5 transition-all duration-200 group-hover:ring-2 group-hover:ring-primary";

/**
 * Poster art carries its own title text, so it is never cropped: the artwork
 * is contained inside the frame and an enlarged, blurred copy of it fills
 * whatever space is left over. Place inside a positioned frame.
 */
export function PosterArt({ src, sizes }: { src: string; sizes: string }) {
  return (
    <>
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        fill
        sizes={sizes}
        className="scale-125 object-cover opacity-55 blur-xl"
      />
      <Image src={src} alt="" fill sizes={sizes} className="object-contain" />
    </>
  );
}

/** 16:9 video poster frame with its badges and hover play affordance. */
function PosterFrame({
  video,
  rank,
  featured,
  sizes,
  className,
}: {
  video: Video;
  rank?: number;
  featured?: boolean;
  sizes: string;
  className?: string;
}) {
  const duration =
    video.durationSeconds > 0 ? formatDuration(video.durationSeconds) : null;

  return (
    <div className={cn(POSTER_FRAME, className)}>
      {video.thumbnailUrl ? (
        <PosterArt src={video.thumbnailUrl} sizes={sizes} />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Play aria-hidden="true" />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

      {rank !== undefined ? (
        <span
          className={cn(
            "absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-xs font-bold text-white",
            rank === 1 ? "bg-primary" : "bg-black/60 backdrop-blur-sm",
          )}
        >
          #{rank}
        </span>
      ) : (
        featured && (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-md shadow-black/30">
            Featured
          </span>
        )
      )}
      {duration && (
        <span className="absolute bottom-2.5 right-2.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
          {duration}
        </span>
      )}

      {/* Play affordance arrives on hover: fade + a small scale-up so it
          reads as surfacing, not blinking on. The pl shift optically
          centres the right-pointing triangle in its circle. */}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <span className="flex size-11 scale-90 items-center justify-center rounded-full bg-primary/90 pl-0.5 shadow-lg shadow-primary/30 transition-transform duration-200 group-hover:scale-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          <Play className="size-5 fill-white text-white" aria-hidden="true" />
        </span>
      </span>
    </div>
  );
}

/**
 * Poster card used in grids and rails.
 * `rank` adds the "#1" badge used on the Trending rail; `featured` adds the
 * "Featured" badge for the home feed's featured title. `menu` adds the ⋮
 * actions beside the title (grids only; rails stay compact).
 * Hover lifts the frame and adds a pink ring; the artwork itself never zooms,
 * so nothing on the poster is cropped out on hover.
 */
export function VideoCard({
  video,
  rank,
  featured = false,
  menu = false,
  className,
}: {
  video: Video;
  rank?: number;
  featured?: boolean;
  menu?: boolean;
  className?: string;
}) {
  const meta = videoMeta(video);

  return (
    <article className={cn("group relative", className)}>
      <PosterFrame
        video={video}
        rank={rank}
        featured={featured}
        sizes="(max-width: 768px) 70vw, 340px"
        className="group-hover:-translate-y-1"
      />

      <div className="mt-2.5 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
            <Link href={watchHref(video)} className={STRETCHED_LINK}>
              {video.title}
            </Link>
          </h3>
          {meta && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {meta}
            </p>
          )}
        </div>
        {menu && (
          <CardMenu
            title={video.title}
            href={watchHref(video)}
            openLabel="Watch now"
            className="-mr-2"
          />
        )}
      </div>
    </article>
  );
}

/**
 * Horizontal row for the list layout: poster on the left, title, meta,
 * creator, and the description excerpt on the right.
 */
export function VideoRow({
  video,
  featured = false,
}: {
  video: Video;
  featured?: boolean;
}) {
  const meta = videoMeta(video);

  return (
    <article className="group relative -mx-2 flex gap-4 rounded-media p-2 transition-colors hover:bg-surface sm:gap-5">
      <PosterFrame
        video={video}
        featured={featured}
        sizes="(max-width: 640px) 160px, 288px"
        className="w-40 shrink-0 sm:w-72"
      />

      <div className="flex min-w-0 flex-1 items-start gap-1 py-0.5">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary sm:text-base">
            <Link href={watchHref(video)} className={STRETCHED_LINK}>
              {video.title}
            </Link>
          </h3>
          {meta && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {meta}
            </p>
          )}
          {video.creator.displayName && (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              {video.creator.displayName}
            </p>
          )}
          {video.description && (
            <p className="mt-2 hidden text-sm text-foreground/70 sm:line-clamp-2">
              {video.description}
            </p>
          )}
        </div>
        <CardMenu
          title={video.title}
          href={watchHref(video)}
          openLabel="Watch now"
        />
      </div>
    </article>
  );
}
