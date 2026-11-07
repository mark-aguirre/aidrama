"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError, isAbortError, isApiError } from "@/lib/api/errors";
import { putFileToSignedUrl } from "@/lib/api/upload";
import { checkVideoFile, trailerTitleFor, type UploadDetails } from "../schemas";
import {
  POLL_INTERVAL_MS,
  completeWithRetry,
  missingTarget,
  obtainSession,
  processingStatusKey,
} from "./use-upload-flow";

/**
 * Phases of the optional trailer track. This is independent of the main
 * video's `UploadPhase`: the trailer is its own video with its own upload
 * session and processing job, so it never blocks or gates the main flow.
 */
export type TrailerPhase =
  | "idle"
  | "selected"
  | "creating"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export interface TrailerFailure {
  stage: "upload" | "processing";
  /** The API's reason; empty when none was given (the UI shows a fallback). */
  message: string;
  requestId: string | null;
}

/** Why linking the trailer to the main video failed. */
export interface TrailerLinkFailure {
  message: string;
  requestId: string | null;
  /** True for transient failures where asking again can succeed. */
  retryable: boolean;
}

/** What the trailer needs from the main video's details. */
export type TrailerDetails = Pick<UploadDetails, "title" | "isAiGenerated">;

interface TrailerState {
  phase: TrailerPhase;
  file: File | null;
  contentType: string | null;
  fileError: string | null;
  details: TrailerDetails | null;
  /** Kept across retries so a failed upload reuses the same draft trailer video. */
  trailerId: string | null;
  uploadId: string | null;
  progress: number;
  failure: TrailerFailure | null;
  notice: string | null;
  linked: boolean;
  linkFailure: TrailerLinkFailure | null;
}

const INITIAL: TrailerState = {
  phase: "idle",
  file: null,
  contentType: null,
  fileError: null,
  details: null,
  trailerId: null,
  uploadId: null,
  progress: 0,
  failure: null,
  notice: null,
  linked: false,
  linkFailure: null,
};

type Action =
  | { type: "file-picked"; file: File; contentType: string }
  | { type: "file-rejected"; message: string }
  | { type: "file-cleared" }
  | { type: "started"; details: TrailerDetails }
  | { type: "created"; trailerId: string }
  | { type: "upload-began"; uploadId: string }
  | { type: "progress"; percent: number }
  | { type: "uploaded" }
  | { type: "failed"; message: string; requestId: string | null }
  | { type: "cancelled" }
  | { type: "linked" }
  | { type: "link-failed"; failure: TrailerLinkFailure }
  | { type: "link-retry" }
  | { type: "reset" };

function reducer(state: TrailerState, action: Action): TrailerState {
  switch (action.type) {
    case "file-picked":
      return {
        ...state,
        phase: "selected",
        file: action.file,
        contentType: action.contentType,
        fileError: null,
        progress: 0,
        failure: null,
        notice: null,
      };
    case "file-rejected":
      return { ...state, fileError: action.message };
    case "file-cleared":
      return {
        ...state,
        phase: "idle",
        file: null,
        contentType: null,
        fileError: null,
        progress: 0,
        failure: null,
        notice: null,
      };
    case "started":
      return {
        ...state,
        phase: "creating",
        details: action.details,
        progress: 0,
        failure: null,
        notice: null,
      };
    case "created":
      return { ...state, trailerId: action.trailerId };
    case "upload-began":
      return { ...state, phase: "uploading", uploadId: action.uploadId, progress: 0 };
    case "progress":
      return { ...state, progress: action.percent };
    case "uploaded":
      return { ...state, phase: "processing", progress: 100 };
    case "failed":
      return {
        ...state,
        phase: "failed",
        failure: { stage: "upload", message: action.message, requestId: action.requestId },
      };
    case "cancelled":
      return { ...state, phase: "selected", progress: 0, failure: null, notice: "Trailer upload cancelled." };
    case "linked":
      return { ...state, linked: true, linkFailure: null };
    case "link-failed":
      return { ...state, linkFailure: action.failure };
    case "link-retry":
      return { ...state, linkFailure: null };
    case "reset":
      return INITIAL;
  }
}

function toLinkFailure(error: unknown): TrailerLinkFailure {
  const apiError = error instanceof ApiError ? error : null;
  return {
    message: apiError?.message || "We couldn't link the trailer to your video.",
    requestId: apiError?.requestId ?? null,
    retryable:
      apiError === null ||
      apiError.status === 0 ||
      apiError.status >= 500 ||
      apiError.code === "CONCURRENT_MODIFICATION",
  };
}

/**
 * The optional trailer track of the upload wizard. A trailer is a normal video
 * of type TRAILER: create it, upload it through the same session flow as the
 * main video, then link it to the main video (`titleId`) as soon as both ids
 * exist. Linking does not wait for processing, and nothing here gates
 * publishing the main video. Each step reports its own failure so the main
 * flow keeps going when the trailer does not.
 */
export function useTrailerUpload(titleId: string | null) {
  const queryClient = useQueryClient();
  const [state, dispatch] = React.useReducer(reducer, INITIAL);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  // Link as soon as the main video and the trailer both exist. A failure parks
  // the track until `retryLink` clears it, so a rejected link is never re-sent
  // in a loop.
  const { trailerId, linked, linkFailure } = state;
  React.useEffect(() => {
    if (!titleId || !trailerId || linked || linkFailure) return;
    const controller = new AbortController();
    api.linkTrailer(titleId, trailerId, controller.signal).then(
      () => dispatch({ type: "linked" }),
      (error: unknown) => {
        if (!isAbortError(error)) dispatch({ type: "link-failed", failure: toLinkFailure(error) });
      },
    );
    return () => controller.abort();
  }, [titleId, trailerId, linked, linkFailure]);

  const polling = state.phase === "processing" && trailerId !== null;
  const statusQuery = useQuery({
    queryKey: processingStatusKey(trailerId),
    queryFn: ({ signal }) => {
      if (!trailerId) throw missingTarget();
      return api.getProcessingStatus(trailerId, signal);
    },
    enabled: polling,
    refetchInterval: (query) => {
      const status = query.state.data?.processingStatus;
      return status === "READY" || status === "FAILED" ? false : POLL_INTERVAL_MS;
    },
    retry: 3,
  });

  const status = statusQuery.data;
  let phase = state.phase;
  let failure = state.failure;
  if (state.phase === "processing" && status) {
    if (status.processingStatus === "READY") {
      phase = "ready";
    } else if (status.processingStatus === "FAILED") {
      phase = "failed";
      failure = { stage: "processing", message: status.failure?.message ?? "", requestId: null };
    }
  }

  const pickFile = React.useCallback((file: File | undefined) => {
    if (!file) return;
    const check = checkVideoFile(file);
    if (!check.ok) {
      dispatch({ type: "file-rejected", message: check.message });
      return;
    }
    dispatch({ type: "file-picked", file, contentType: check.contentType });
  }, []);

  /** Create (once), upload, and confirm the trailer video. */
  const run = React.useCallback(
    async (details: TrailerDetails) => {
      const { file, contentType, trailerId: existingId, uploadId: previousUploadId } = state;
      if (!file || !contentType) return;

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      const { signal } = controller;

      dispatch({ type: "started", details });
      try {
        let videoId = existingId;
        if (!videoId) {
          const video = await api.createVideo(
            {
              type: "TRAILER",
              title: trailerTitleFor(details.title),
              isAiGenerated: details.isAiGenerated,
            },
            signal,
          );
          videoId = video.id;
          dispatch({ type: "created", trailerId: videoId });
        }

        const session = await obtainSession({
          videoId,
          file,
          contentType,
          previousUploadId,
          signal,
        });
        dispatch({ type: "upload-began", uploadId: session.id });

        await putFileToSignedUrl(session.upload, file, {
          signal,
          onProgress: (percent) => dispatch({ type: "progress", percent }),
        });

        const result = await completeWithRetry(session.id, signal);
        queryClient.setQueryData(processingStatusKey(videoId), result.processing);
        dispatch({ type: "uploaded" });
      } catch (error) {
        if (isAbortError(error)) return;
        dispatch({
          type: "failed",
          message: error instanceof ApiError ? error.message : "",
          requestId: error instanceof ApiError ? error.requestId : null,
        });
      }
    },
    [state, queryClient],
  );

  /** Start the trailer alongside the main upload. No-op unless a trailer file is waiting. */
  const begin = React.useCallback(
    (details: TrailerDetails) => {
      if (state.phase === "selected") void run(details);
    },
    [state.phase, run],
  );

  /** Re-run a failed trailer with the details it started with. */
  const retry = React.useCallback(() => {
    if (phase === "failed" && state.details) void run(state.details);
  }, [phase, state.details, run]);

  /** Abort the transfer, cancel the server session, and return to the selected file. */
  const cancel = React.useCallback(async () => {
    abortRef.current?.abort();
    if (state.uploadId) {
      try {
        await api.cancelUpload(state.uploadId);
      } catch (error) {
        if (isApiError(error, "UPLOAD_ALREADY_COMPLETED")) {
          // Too late to cancel: the upload was confirmed, so processing has begun.
          dispatch({ type: "uploaded" });
          return;
        }
        // Any other failure: a leftover session is replaced on the next start.
      }
    }
    dispatch({ type: "cancelled" });
  }, [state.uploadId]);

  return {
    state: { ...state, phase, failure },
    /** True once a trailer file is chosen or a trailer video exists. */
    engaged: phase !== "idle" || trailerId !== null,
    statusQuery: {
      percent: status?.progressPercent ?? 0,
      error: statusQuery.isError,
      retry: () => void statusQuery.refetch(),
    },
    pickFile,
    clearFile: () => dispatch({ type: "file-cleared" }),
    begin,
    retry,
    cancel,
    retryLink: () => dispatch({ type: "link-retry" }),
    reset: () => {
      abortRef.current?.abort();
      dispatch({ type: "reset" });
    },
  };
}

/** The trailer track as handed to the wizard's trailer section. */
export type TrailerTrack = ReturnType<typeof useTrailerUpload>;
