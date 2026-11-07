"use client";

import * as React from "react";
import Hls from "hls.js";
import { AlertCircle } from "lucide-react";
import { useQualifiedView } from "../hooks/use-qualified-view";

/**
 * Adaptive HLS player (spec 3.9).
 *
 * Uses hls.js where MSE is available and falls back to native HLS playback
 * on Safari/iOS. During the skeleton it is fed a sample public stream; the
 * same component plays real pipeline output unchanged.
 */
export function VideoPlayer({
  src,
  poster,
  title,
  autoPlay = false,
  viewSlug,
}: {
  src: string | null;
  poster?: string | null;
  title: string;
  /** Start playback on mount; only for players opened by a user action. */
  autoPlay?: boolean;
  /** Slug of the video being watched. Set it to count a view after 10 s of play time; leave unset for trailers. */
  viewSlug?: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  useQualifiedView(videoRef, viewSlug, src);

  // Stop playback and release the media source whenever the component
  // unmounts. Without this, navigating away leaves the <video> element
  // playing its audio in the background (the browser keeps a detached
  // media element alive while it still has a source).
  React.useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Clear any prior error asynchronously so this effect never calls
    // setState synchronously in its body (react-hooks/set-state-in-effect).
    queueMicrotask(() => setError(null));

    // Not an HLS playlist (e.g. the dev pipeline serves the original mp4
    // directly). Let the browser play it as a progressive <video> source.
    const isHls = /\.m3u8(\?|#|$)/i.test(src);
    if (!isHls) {
      video.src = src;
      return;
    }

    // Native HLS (Safari, iOS).
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setError("This video could not be played.");
        }
      });
      return () => hls.destroy();
    }

    queueMicrotask(() =>
      setError("Your browser does not support adaptive streaming."),
    );
  }, [src]);

  if (!src) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
        This video is still processing and is not ready to play.
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        controls
        autoPlay={autoPlay}
        playsInline
        poster={poster ?? undefined}
        className="aspect-video w-full"
        aria-label={title}
      >
        <track kind="captions" />
      </video>
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-center text-sm text-white"
        >
          <AlertCircle aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  );
}
