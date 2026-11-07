import * as React from "react";
import { api } from "@/lib/api/client";
import { getViewSessionId } from "../view-session-id";

/** Accumulated play time that makes a playback count as a view. */
const QUALIFIED_VIEW_SECONDS = 10;

/**
 * Largest forward jump between two `timeupdate` events still treated as
 * playback. Browsers fire them about every 250 ms; anything bigger is a seek
 * or a gap and must not add to the total.
 */
const MAX_PLAYBACK_STEP_SECONDS = 2;

/**
 * Sends one VIEW_QUALIFIED event once the video has really played for
 * QUALIFIED_VIEW_SECONDS.
 *
 * Play time is the sum of small forward `currentTime` steps seen while the
 * element is playing. Pausing, buffering, and seeking add nothing, and the
 * baseline is reset on each so a seek never counts as watched time. The event
 * fires once per attached playback: pause, resume, and seek do not repeat it.
 * The count restarts when `slug` or `src` changes.
 *
 * `slug` undefined turns tracking off (trailers, owner previews).
 * `src` is a dependency only so tracking attaches when the player first
 * renders its <video> element, which is absent while there is no source.
 */
export function useQualifiedView(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  slug: string | undefined,
  src: string | null,
): void {
  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !slug || !src) return;

    let playedSeconds = 0;
    let lastTime: number | null = null;
    let sent = false;

    const isAdvancing = () => !video.paused && !video.seeking;
    const resetBaseline = () => {
      lastTime = isAdvancing() ? video.currentTime : null;
    };

    const onTimeUpdate = () => {
      if (sent) return;
      if (lastTime !== null && isAdvancing()) {
        const step = video.currentTime - lastTime;
        if (step > 0 && step <= MAX_PLAYBACK_STEP_SECONDS) playedSeconds += step;
      }
      resetBaseline();

      if (playedSeconds >= QUALIFIED_VIEW_SECONDS) {
        sent = true;
        void sendQualifiedView(slug, Math.floor(playedSeconds));
      }
    };
    const stopBaseline = () => {
      lastTime = null;
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("playing", resetBaseline);
    video.addEventListener("seeked", resetBaseline);
    video.addEventListener("pause", stopBaseline);
    video.addEventListener("seeking", stopBaseline);
    video.addEventListener("ended", stopBaseline);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("playing", resetBaseline);
      video.removeEventListener("seeked", resetBaseline);
      video.removeEventListener("pause", stopBaseline);
      video.removeEventListener("seeking", stopBaseline);
      video.removeEventListener("ended", stopBaseline);
    };
  }, [videoRef, slug, src]);
}

/**
 * Fire and forget. The response is not used, and every failure (network,
 * 400, 404, an unavailable id) is dropped: a view ping must never surface an
 * error to the viewer or disturb playback. No retry beyond the client's single
 * anonymous retry on 401.
 */
async function sendQualifiedView(
  slug: string,
  watchedSeconds: number,
): Promise<void> {
  try {
    await api.recordViewEvent(slug, {
      eventType: "VIEW_QUALIFIED",
      watchedSeconds,
      sessionId: getViewSessionId(),
    });
  } catch {
    // Intentionally ignored; see above.
  }
}
