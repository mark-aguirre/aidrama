import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchTrailerButton } from "@/features/watch/components/watch-trailer-button";
import { formatDuration, formatViews } from "@/lib/utils";
import type { FeaturedTitle, PlatformStat, Video } from "@/types/domain";

/**
 * The backend sends every hero stat label in the plural ("Videos",
 * "Creators", "Views"). Drop the trailing "s" when the value is exactly one,
 * so a fresh catalogue reads "1 Creator" instead of "1 Creators". Compact
 * values like "1.2K" are never one, so they stay plural.
 */
function statLabel(value: string, label: string): string {
  const isOne = Number(value) === 1;
  return isOne && label.endsWith("s") ? label.slice(0, -1) : label;
}

/** Genre, runtime, and views for the featured title, from real values only. */
function featuredMeta(video: Video): string {
  return [
    video.genre || null,
    video.durationSeconds > 0 ? formatDuration(video.durationSeconds) : null,
    video.viewCount > 0 ? `${formatViews(video.viewCount)} views` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Full-bleed home hero, matched to the landing mockup: brand promise and
 * calls to action on the left, the featured title and trailer on the right.
 * It sits under the sticky header (mobile 56px, desktop 64px) so the art
 * fills the top.
 * `featured` is null while the catalogue is empty; the hero then keeps the
 * brand promise without a title or calls to action.
 */
export function FeaturedHero({
  featured,
  stats,
}: {
  featured: FeaturedTitle | null;
  stats: PlatformStat[];
}) {
  const video = featured?.video ?? null;
  // Prefer an explicit backdrop; otherwise use the featured video's own
  // thumbnail so the hero background always reflects the featured title.
  const backdropSrc = featured?.backdropUrl || video?.thumbnailUrl || null;

  return (
    <section className="relative -mt-14 overflow-hidden lg:-mt-16">
      <div className="absolute inset-0">
        {backdropSrc && (
          // `animate-backdrop` eases the art from a hair over-scale to rest on
          // load, giving the still frame a sense of depth. Transform-only, and
          // the reduced-motion reset settles it instantly at scale(1).
          <Image
            src={backdropSrc}
            alt=""
            fill
            priority
            sizes="100vw"
            // Narrow screens keep the right of the frame (where the subject
            // usually sits) out from under the text; wide screens centre it.
            className="animate-backdrop object-cover object-[70%_center] lg:object-center"
          />
        )}
        {/* Readability scrims. Below `lg` the copy sits over the whole frame,
            so the lift is bottom-up; from `lg` the copy is left-aligned
            beside the art, so the lift runs left-to-right. */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/35 lg:bg-gradient-to-r lg:from-background lg:via-background/75 lg:to-background/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/40" />
      </div>

      <div className="relative mx-auto grid min-h-[620px] max-w-[1400px] items-center gap-10 px-4 pb-16 pt-28 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:pt-32">
        <div className="max-w-xl">
          <p className="animate-enter enter-delay-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            AI-powered drama universe
          </p>
          <h1 className="animate-enter enter-delay-2 mt-4 font-display text-5xl leading-[1.02] text-foreground sm:text-6xl">
            Endless stories.
            <br />
            <span className="text-gradient">New worlds.</span>
          </h1>
          <p className="animate-enter enter-delay-3 mt-5 max-w-md text-base text-foreground/75">
            Watch, create, and share AI-generated dramas in any genre, any
            language, anytime.
          </p>

          {/* Below `lg` the right column is hidden, so "Watch now" would have
              nothing to refer to. Name the featured title here instead. */}
          {featured && video && (
            <div className="mt-8 lg:hidden">
              <p className="text-xs uppercase tracking-[0.25em] text-primary">
                {featured.kicker}
              </p>
              <p className="mt-1.5 font-editorial text-3xl leading-tight text-foreground">
                {video.title}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {featuredMeta(video)}
              </p>
            </div>
          )}

          {video && (
            <div className="animate-enter enter-delay-4 mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 lg:mt-8">
              <Button size="lg" asChild className="shadow-lg shadow-primary/25">
                <Link href={`/watch/${video.slug}`}>
                  <Play className="fill-current" aria-hidden="true" />
                  Watch now
                </Link>
              </Button>
              {/* The right-column trailer control is `hidden lg:block`, so only
                  one trigger is ever visible. */}
              {video.trailer && (
                <WatchTrailerButton
                  trailer={video.trailer}
                  fallbackPoster={video.thumbnailUrl}
                  className="lg:hidden"
                />
              )}
            </div>
          )}

          <dl className="animate-enter enter-delay-5 mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {stats.map((s) => (
              // `dt` must precede its `dd`; column-reverse puts the number on
              // top without reading the label twice to a screen reader.
              <div key={s.label} className="flex flex-col-reverse">
                <dt className="text-xs text-muted-foreground">
                  {statLabel(s.value, s.label)}
                </dt>
                <dd className="font-display text-2xl text-foreground">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {featured && video && (
          <div className="animate-enter enter-delay-3 hidden justify-self-end text-right lg:block">
            <p className="font-editorial text-5xl leading-tight text-foreground">
              {video.title}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-primary">
              {featured.kicker}
            </p>
            <p className="ml-auto mt-4 max-w-[220px] text-sm text-foreground/75">
              {featured.tagline}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              {featuredMeta(video)}
            </p>
            {video.trailer && (
              <WatchTrailerButton
                trailer={video.trailer}
                fallbackPoster={video.thumbnailUrl}
                className="mt-8"
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}
