import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { SectionHeader } from "@/components/layout/section-header";
import { ScrollRail } from "@/components/shared/scroll-rail";
import { cn } from "@/lib/utils";
import type { HomeFeed, Video } from "@/types/domain";
import {
  distinctTagline,
  posterTitleSize,
  sentenceCase,
} from "../title-display";
import { MobileHeroCarousel, type HeroSlide } from "./mobile-hero-carousel";
import { CARD_PRESS } from "./video-card";

/** The featured title plus the top trending titles. */
const MAX_HERO_SLIDES = 5;

/** Rails run to the screen edges: cancel the page padding, then restore it inside the scroller. */
const RAIL_BLEED = "-mx-4 gap-3 px-4 scroll-px-4";

const CARD_LINK =
  "block rounded-media outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background";

function watchHref(video: Video): string {
  return `/watch/${video.slug}`;
}

/**
 * Genres that exist in the feed, most common first. The strip links to Browse
 * per genre, and an unknown genre lists nothing, so only genres that have a
 * title on screen are offered.
 */
function genresInFeed(feed: HomeFeed): string[] {
  const counts = new Map<string, number>();
  const videos = [
    ...(feed.featured ? [feed.featured.video] : []),
    ...feed.trending,
    ...feed.originals,
  ];
  const seen = new Set<string>();
  for (const video of videos) {
    if (seen.has(video.id) || !video.genre) continue;
    seen.add(video.id);
    counts.set(video.genre, (counts.get(video.genre) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([genre]) => genre);
}

function heroSlides(feed: HomeFeed): HeroSlide[] {
  const slides: HeroSlide[] = [];
  const { featured } = feed;
  if (featured) {
    const { video } = featured;
    slides.push({
      id: video.id,
      slug: video.slug,
      title: video.title,
      tagline: distinctTagline(video.title, featured.tagline),
      pill: featured.kicker ? sentenceCase(featured.kicker) : "Featured",
      imageSrc: featured.backdropUrl || video.thumbnailUrl,
    });
  }
  for (const video of feed.trending) {
    if (slides.length >= MAX_HERO_SLIDES) break;
    if (slides.some((slide) => slide.id === video.id)) continue;
    slides.push({
      id: video.id,
      slug: video.slug,
      title: video.title,
      tagline: distinctTagline(video.title, video.description),
      pill: "Trending now",
      imageSrc: video.thumbnailUrl,
    });
  }
  return slides;
}

/** Text tabs under the header. "All" is this screen; genres open Browse filtered. */
function GenreStrip({ genres }: { genres: string[] }) {
  const tabs = [
    { href: "/", label: "All", current: true },
    ...genres.map((genre) => ({
      href: `/explore?genre=${encodeURIComponent(genre)}`,
      label: genre,
      current: false,
    })),
  ];
  return (
    <nav aria-label="Genres">
      <ul className="no-scrollbar flex overflow-x-auto overscroll-x-contain px-2 [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]">
        {tabs.map(({ href, label, current }) => (
          <li key={label} className="shrink-0">
            <Link
              href={href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center px-3 text-sm whitespace-nowrap transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                current
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground active:text-foreground",
              )}
            >
              {label}
              {current && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-3 bottom-1 mx-auto h-0.5 w-5 rounded-full bg-primary"
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 16:9 card: thumbnail, title bottom-left, outlined play button bottom-right. */
function LandscapeCard({ video }: { video: Video }) {
  return (
    <article className="w-[72vw] max-w-[22rem] shrink-0 snap-start">
      <Link href={watchHref(video)} className={cn(CARD_LINK, CARD_PRESS)}>
        <div className="relative aspect-video overflow-hidden rounded-media bg-surface-2 ring-1 ring-white/5">
          {video.thumbnailUrl ? (
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 1024px) 72vw, 352px"
              // Portrait art is centre-cropped into 16:9; keep the upper part.
              className="object-cover object-[center_30%]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Play aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-3">
            <h3 className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-semibold leading-snug text-white">
              {video.title}
            </h3>
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/70 pl-0.5"
            >
              <Play className="size-4 fill-white text-white" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

/** 3:4 poster with the title set in the editorial serif over its lower part. */
function PosterCard({ video }: { video: Video }) {
  return (
    <article className="w-[38vw] max-w-44 shrink-0 snap-start">
      <Link href={watchHref(video)} className={cn(CARD_LINK, CARD_PRESS)}>
        <div className="relative aspect-[3/4] overflow-hidden rounded-media bg-surface-2 ring-1 ring-white/5">
          {video.thumbnailUrl ? (
            <Image
              src={video.thumbnailUrl}
              alt=""
              fill
              unoptimized
              sizes="(max-width: 1024px) 38vw, 176px"
              className="object-cover object-[center_20%]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Play aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 via-45% to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3
              className={cn(
                "line-clamp-3 break-words font-editorial leading-tight text-white",
                posterTitleSize(video.title),
              )}
            >
              {video.title}
            </h3>
          </div>
        </div>
      </Link>
    </article>
  );
}

function EmptyRail() {
  return (
    <p className="rounded-media border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
      Nothing here yet. New titles appear as creators publish them.
    </p>
  );
}

/** Shown in place of the carousel while the catalogue is empty. */
function EmptyIntro() {
  return (
    <section className="px-4 pb-2 pt-6">
      <h2 className="font-display text-3xl leading-tight text-foreground">
        Endless stories. New worlds.
      </h2>
      <p className="mt-3 text-sm text-foreground/75">
        Watch, create, and share AI-generated dramas in any genre, any
        language, anytime.
      </p>
    </section>
  );
}

/**
 * The phone home screen (below `lg`): genre tabs, a swipeable hero, a
 * landscape rail of the newest titles and a poster rail of trending titles.
 * Every value comes from GET /home; nothing is invented.
 */
export function MobileHome({ feed }: { feed: HomeFeed }) {
  const slides = heroSlides(feed);

  return (
    <div className="lg:hidden">
      <h1 className="sr-only">AI Drama home</h1>
      <GenreStrip genres={genresInFeed(feed)} />

      {slides.length > 0 ? (
        <MobileHeroCarousel slides={slides} />
      ) : (
        <EmptyIntro />
      )}

      <div className="flex flex-col gap-8 px-4 pb-4 pt-3">
        <section>
          <SectionHeader title="AI originals" href="/explore?sort=recent" />
          {feed.originals.length > 0 ? (
            <ScrollRail label="AI originals" className={RAIL_BLEED}>
              {feed.originals.map((video) => (
                <LandscapeCard key={video.id} video={video} />
              ))}
            </ScrollRail>
          ) : (
            <EmptyRail />
          )}
        </section>

        <section>
          <SectionHeader
            title="Trending AI dramas"
            href="/explore?sort=popular"
          />
          {feed.trending.length > 0 ? (
            <ScrollRail label="Trending AI dramas" className={RAIL_BLEED}>
              {feed.trending.map((video) => (
                <PosterCard key={video.id} video={video} />
              ))}
            </ScrollRail>
          ) : (
            <EmptyRail />
          )}
        </section>
      </div>
    </div>
  );
}
