"use client";

import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatViews } from "@/lib/utils";
import type { Video } from "@/types/domain";
import { useVideoLike } from "../hooks/use-video-like";

/**
 * Heart toggle for the watch page. Anonymous visitors get the inline sign-in
 * panel (the API would answer 401); the API enforces the sign-in requirement either way.
 *
 * `disabled` is the watch page's own gate (the video is still processing);
 * `describedBy` points at the hint that explains it.
 */
export function LikeButton({
  video,
  disabled = false,
  describedBy,
}: {
  video: Pick<Video, "slug" | "isLiked" | "likeCount">;
  disabled?: boolean;
  describedBy?: string;
}) {
  const { liked, likeCount, availability, pending, errorText, toggle } =
    useVideoLike(video);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={toggle}
        disabled={disabled || availability === "checking"}
        aria-pressed={liked}
        aria-busy={pending}
        aria-describedby={describedBy}
      >
        <Heart
          aria-hidden="true"
          className={cn(liked && "fill-primary text-primary")}
        />
        <span className="sr-only">{liked ? "Liked" : "Like"}</span>
        <span className="tabular-nums">{formatViews(likeCount)}</span>
      </Button>
      {errorText && (
        <p role="alert" className="order-last basis-full text-xs text-destructive">
          {errorText}
        </p>
      )}
    </>
  );
}
