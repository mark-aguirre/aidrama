import { Suspense } from "react";
import Image from "next/image";
import { connection } from "next/server";
import { api } from "@/lib/api/client";
import type { VideoType } from "@/types/domain";
import { getFeaturedTitle } from "../featured";

/**
 * Where a discovery page takes its backdrop art from, always live data:
 * - `featured`: the home feed's featured title (Explore).
 * - a VideoType: the featured title when it is of that type, otherwise the
 *   most-viewed title of that type that has a thumbnail (Films, Shorts).
 * - `series`: the newest series that has a poster.
 */
export type BackdropSource = "featured" | VideoType | "series";

async function resolveBackdrop(source: BackdropSource): Promise<string | null> {
  if (source === "series") {
    const series = await api.listSeries().catch(() => []);
    return series.find((s) => s.posterUrl)?.posterUrl ?? null;
  }

  const featured = await getFeaturedTitle();
  const featuredArt =
    featured?.backdropUrl || featured?.video.thumbnailUrl || null;
  if (source === "featured" || featured?.video.type === source) {
    if (featuredArt) return featuredArt;
    if (source === "featured") return null;
  }

  const top = await api
    .listVideos({ type: source, sort: "popular" })
    .then((page) => page.data)
    .catch(() => []);
  return top.find((v) => v.thumbnailUrl)?.thumbnailUrl ?? null;
}

/**
 * Art behind the top of a discovery page, anchored right and faded into the
 * page on the left and bottom so the headline, genre pills, and sort row stay
 * readable over it. It extends under the translucent sticky header (mobile
 * 56px, desktop 64px). Renders nothing when there is no art yet.
 */
async function Backdrop({ source }: { source: BackdropSource }) {
  // Live catalogue data: fetch per request, never during the build prerender.
  await connection();
  const src = await resolveBackdrop(source);
  if (!src) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-14 h-[560px] overflow-hidden lg:-top-16 lg:h-[600px]"
    >
      <div className="absolute inset-y-0 right-0 w-full lg:w-[70%]">
        <Image
          src={src}
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 70vw"
          className="animate-backdrop object-cover object-[70%_center]"
        />
      </div>
      {/* Readability scrims. Below `lg` the copy sits over the whole frame, so
          the whole frame is dimmed; from `lg` the lift runs left-to-right. */}
      <div className="absolute inset-0 bg-background/70 lg:bg-gradient-to-r lg:from-background lg:from-25% lg:via-background/70 lg:via-50% lg:to-background/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-background/40" />
    </div>
  );
}

/**
 * Shared layout for Explore, Series, Films, and Shorts: backdrop art, an
 * eyebrow, a two-line headline (second line in the brand gradient), the lead,
 * then the page's filters and results as `children`.
 */
export function DiscoveryPage({
  backdrop,
  eyebrow,
  title,
  accent,
  lead,
  children,
}: {
  backdrop: BackdropSource;
  eyebrow: string;
  title: string;
  accent: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex-1">
      <Suspense fallback={null}>
        <Backdrop source={backdrop} />
      </Suspense>
      <div className="relative mx-auto w-full max-w-[1400px] px-4 pb-14 pt-10 sm:px-8 lg:pt-14">
        <header className="mb-8 max-w-2xl">
          <p className="animate-enter enter-delay-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {eyebrow}
          </p>
          <h1 className="animate-enter enter-delay-2 mt-2 font-display text-3xl leading-[1.1] text-foreground sm:text-4xl lg:text-[2.75rem]">
            {title}
            <br />
            <span className="text-gradient">{accent}</span>
          </h1>
          <p className="animate-enter enter-delay-3 mt-3 text-sm text-foreground/75">
            {lead}
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}
