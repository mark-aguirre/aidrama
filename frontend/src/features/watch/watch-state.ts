import type { ProcessingStatus, Video } from "@/types/domain";

export type WatchState = "playable" | "processing" | "failed";

const IN_PROGRESS: ReadonlySet<ProcessingStatus> = new Set([
  "PENDING",
  "UPLOADING",
  "PROCESSING",
]);

/**
 * Which watch experience a video gets (design 3.2). Only the owner can load a
 * video that is not READY: the public endpoint returns published videos only.
 */
export function getWatchState(video: Pick<Video, "processingStatus">): WatchState {
  if (video.processingStatus === "FAILED") return "failed";
  if (IN_PROGRESS.has(video.processingStatus)) return "processing";
  return "playable";
}
