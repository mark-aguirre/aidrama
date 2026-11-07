"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignIn } from "@/features/auth/components/sign-in-provider";
import { useRestoredSession } from "@/features/auth/hooks/use-restored-session";
import { api } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { LikeResponse, Video } from "@/types/domain";

type LikeState = LikeResponse;

/**
 * "anonymous": a click opens the inline sign-in panel.
 * "checking":  the session or the viewer's like state is still loading.
 * "ready":     a click toggles the like.
 */
export type LikeAvailability = "anonymous" | "checking" | "ready";

export interface VideoLike {
  liked: boolean;
  likeCount: number;
  availability: LikeAvailability;
  pending: boolean;
  /** Set after a failed toggle; the UI has already been rolled back. */
  errorText: string | null;
  toggle: () => void;
}

/** The state after the viewer asks for `nextLiked`, before the server confirms. */
function applyLike(state: LikeState, nextLiked: boolean): LikeState {
  if (state.liked === nextLiked) return state;
  const delta = nextLiked ? 1 : -1;
  return { liked: nextLiked, likeCount: Math.max(0, state.likeCount + delta) };
}

/**
 * Like state and toggle for one video.
 *
 * The server-rendered `video` is fetched without a token, so its `isLiked` is
 * always false and never describes the viewer. For a signed-in viewer the real
 * state is read client-side with the token. That query is keyed by user id, so
 * one account's state is never served from the cache to another account or to
 * a signed-out visitor.
 *
 * A toggle is optimistic: it flips `liked` and adjusts `likeCount` at once,
 * then replaces both with the server's `{ liked, likeCount }` (the count is
 * authoritative). On failure the previous state is restored. Further clicks
 * are ignored while a toggle is in flight.
 *
 * An anonymous click opens the shared sign-in panel. After a successful login
 * the like the visitor asked for is applied once their real like state has
 * loaded, unless they already liked the video. Dismissing the panel applies
 * nothing.
 */
export function useVideoLike(
  video: Pick<Video, "slug" | "isLiked" | "likeCount">,
): VideoLike {
  const { slug } = video;
  const queryClient = useQueryClient();
  const signIn = useSignIn();
  const session = useRestoredSession();
  const likeAfterSignIn = React.useRef(false);
  const [signInCount, setSignInCount] = React.useState(0);
  const userId = session.user?.id ?? null;
  const queryKey = ["video-like", userId, slug] as const;

  const stateQuery = useQuery({
    queryKey,
    queryFn: async (): Promise<LikeState | null> => {
      const fresh = await api.getVideoBySlug(slug);
      return fresh ? { liked: fresh.isLiked, likeCount: fresh.likeCount } : null;
    },
    enabled: userId !== null,
  });

  const rendered: LikeState = {
    liked: video.isLiked,
    likeCount: video.likeCount,
  };
  const current: LikeState =
    userId === null
      ? { liked: false, likeCount: video.likeCount }
      : (stateQuery.data ?? rendered);

  const mutation = useMutation({
    mutationFn: (nextLiked: boolean) =>
      nextLiked ? api.likeVideo(slug) : api.unlikeVideo(slug),
    onMutate: async (nextLiked) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = current;
      queryClient.setQueryData<LikeState>(queryKey, applyLike(previous, nextLiked));
      return { previous };
    },
    onError: (_error, _nextLiked, context) => {
      if (context) queryClient.setQueryData<LikeState>(queryKey, context.previous);
    },
    onSuccess: ({ liked, likeCount }) => {
      queryClient.setQueryData<LikeState>(queryKey, { liked, likeCount });
    },
  });

  let availability: LikeAvailability = "ready";
  if (session.status === "anonymous") availability = "anonymous";
  else if (userId === null || stateQuery.isPending) availability = "checking";

  // `signInCount` re-runs the effect when a login completes, even if the
  // viewer's like state was already available and nothing else changed.
  const { mutate } = mutation;
  const alreadyLiked = current.liked;
  React.useEffect(() => {
    if (!likeAfterSignIn.current || availability !== "ready") return;
    likeAfterSignIn.current = false;
    if (!alreadyLiked) mutate(true);
  }, [availability, alreadyLiked, mutate, signInCount]);

  function toggle() {
    if (availability === "anonymous") {
      signIn.open({
        onSuccess: () => {
          likeAfterSignIn.current = true;
          setSignInCount((count) => count + 1);
        },
      });
      return;
    }
    if (availability !== "ready" || mutation.isPending) return;
    mutation.mutate(!current.liked);
  }

  return {
    liked: current.liked,
    likeCount: current.likeCount,
    availability,
    pending: mutation.isPending,
    errorText: mutation.isError
      ? errorMessage(mutation.error, "We couldn't update your like. Try again.")
      : null,
    toggle,
  };
}
