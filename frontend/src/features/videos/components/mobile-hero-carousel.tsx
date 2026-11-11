"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { heroTitleSize } from "../title-display";

export interface HeroSlide {
  id: string;
  slug: string;
  title: string;
  /** Already filtered: null when it would repeat the title. */
  tagline: string | null;
  /** Short label on the pink pill, e.g. "Trending now". */
  pill: string;
  imageSrc: string | null;
}

/**
 * Full-bleed, swipeable hero for phones. A horizontal scroll-snap strip: the
 * browser does the swiping and snapping, `overscroll-x-contain` keeps a swipe
 * from scrolling the page sideways or triggering a back-swipe, and a scroll
 * listener keeps the pagination dots in step. No autoplay.
 */
export function MobileHeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const frameRef = React.useRef(0);
  const [active, setActive] = React.useState(0);
  const count = slides.length;

  const syncActive = React.useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const el = scrollerRef.current;
      if (!el || el.clientWidth === 0) return;
      const index = Math.round(el.scrollLeft / el.clientWidth);
      setActive(Math.min(Math.max(index, 0), count - 1));
    });
  }, [count]);

  React.useEffect(() => {
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  function goTo(index: number) {
    const el = scrollerRef.current;
    if (!el) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollTo({
      left: index * el.clientWidth,
      behavior: reduced ? "auto" : "smooth",
    });
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured dramas"
      className="relative"
    >
      <div
        ref={scrollerRef}
        onScroll={syncActive}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {slides.map((slide, index) => (
          <div
            key={slide.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${count}`}
            className="relative aspect-[3/4] max-h-[min(34rem,72dvh)] w-full shrink-0 snap-center snap-always overflow-hidden bg-surface-2"
          >
            {slide.imageSrc && (
              <Image
                src={slide.imageSrc}
                alt=""
                fill
                unoptimized
                priority={index === 0}
                sizes="100vw"
                // Portrait art keeps its upper third (faces) in the 3:4 frame;
                // landscape art centre-crops. The first slide settles in once.
                className={cn(
                  "object-cover object-[center_25%]",
                  index === 0 && "animate-backdrop",
                )}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background from-10% via-background/75 via-40% to-transparent" />

            <div
              className={cn(
                "absolute inset-x-0 bottom-0 flex flex-col items-start px-4",
                count > 1 ? "pb-12" : "pb-6",
              )}
            >
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold leading-none text-primary-foreground">
                {slide.pill}
              </span>
              <h2
                className={cn(
                  "mt-3 line-clamp-3 break-words font-editorial leading-[1.08] text-balance text-foreground",
                  heroTitleSize(slide.title),
                )}
              >
                {slide.title}
              </h2>
              {slide.tagline && (
                <p className="mt-2 line-clamp-2 max-w-xs text-sm text-foreground/80">
                  {slide.tagline}
                </p>
              )}
              <Button
                asChild
                size="lg"
                className="mt-4 rounded-full bg-white px-6 font-semibold text-background shadow-lg shadow-black/30 hover:bg-white/90"
              >
                <Link href={`/watch/${slide.slug}`}>
                  <Play className="fill-current" aria-hidden="true" />
                  Watch now
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>

      {count > 1 && (
        <div
          role="group"
          aria-label="Choose a slide"
          className="absolute inset-x-0 bottom-1 flex justify-center"
        >
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Show slide ${index + 1} of ${count}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => goTo(index)}
              className="flex h-11 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-[var(--ease-arrive)]",
                  index === active ? "w-5 bg-primary" : "w-1.5 bg-white/35",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
