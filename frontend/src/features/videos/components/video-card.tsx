import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { cn, formatDuration, formatViews } from "@/lib/utils";
import type { Video } from "@/types/domain";

/** Season/episode position when known, otherwise a plain "Episode" marker. */
function episodeLabel(video: Video): string | null {
  if (video.type !== "EPISODE") return null;
  const { seasonNumber, episodeNumber } = video;
  if (seasonNumber !== null && episodeNumber !== null) {
    return `S${seasonNumber} E${episodeNumber}`;
  }
  return "Episode";
}

/**
 * Poster card used in grids and rails.
 * `rank` adds the "#1" badge used on the Trending rail. The runtime sits on
 * the frame where viewers look for it; genre, episode position, and views go
 * underneath. Every value is omitted when the API has not supplied it yet.
 * Hover lifts the frame and adds a pink ring; the artwork itself never zooms,
 * so nothing on the poster is cropped out on hover.
 */
export function VideoCard({
  video,
  rank,
  className,
}: {
  video: Video;
  rank?: number;
  className?: string;
}) {
  const duration =
    video.durationSeconds > 0 ? formatDuration(video.durationSeconds) : null;
  const meta = [
    video.genre || null,
    episodeLabel(video),
    video.viewCount > 0 ? `${formatViews(video.viewCount)} views` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/watch/${video.slug}`}
      className={cn(
        "group block rounded-media focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
        className,
      )}
    >
      <div className="relative aspect-video overflow-hidden rounded-media bg-surface-2 ring-1 ring-white/5 transition-all duration-200 group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-primary">
        {video.thumbnailUrl ? (
          <>
            {/* Poster art carries its own title text, so it is never cropped:
                the artwork is contained inside the 16:9 frame and an enlarged,
                blurred copy of it fills whatever space is left over. */}
            <Image
              src={video.thumbnailUrl}
              alt=""
              aria-hidden="true"
              fill
              sizes="(max-width: 768px) 70vw, 280px"
              className="scale-125 object-cover opacity-55 blur-xl"
            />
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 70vw, 280px"
              className="object-contain"
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Play aria-hidden="true" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {rank !== undefined && (
          <span
            className={cn(
              "absolute left-2.5 top-2.5 rounded-md px-2 py-0.5 text-xs font-bold text-white",
              rank === 1 ? "bg-primary" : "bg-black/60 backdrop-blur-sm",
            )}
          >
            #{rank}
          </span>
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

      <div className="mt-2.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
          {video.title}
        </h3>
        {meta && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {meta}
          </p>
        )}
      </div>
    </Link>
  );
}
