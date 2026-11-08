"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { ApiError, CLIENT_ERROR_CODES, isAbortError, isApiError } from "@/lib/api/errors";
import { putFileToSignedUrl, putPartsToSignedUrls } from "@/lib/api/upload";
import type { CompletedUploadPart, UploadSession, Video } from "@/types/domain";
import { checkThumbnailFile, checkVideoFile, type UploadDetails } from "../schemas";

/** How often processing status is polled while the video is being transcoded. */
export const POLL_INTERVAL_MS = 3000;
/** Extra attempts for `complete` when storage has not caught up yet (idempotent, safe to retry). */
const COMPLETE_RETRIES = 3;
const COMPLETE_RETRY_CODES = new Set(["UPLOAD_OBJECT_MISSING", "STORAGE_UNAVAILABLE"]);

export const processingStatusKey = (videoId: string | null) =>
  ["processing-status", videoId] as const;

export type UploadPhase =
  | "idle"
  | "selected"
  | "pending"
  | "uploading"
  | "processing"
  | "ready"
  | "published"
  | "failed";

export interface UploadFailure {
  stage: "upload" | "processing";
  /** The stage of the checklist where it stopped. */
  at: "PENDING" | "UPLOADING" | "PROCESSING";
  /** The API's reason; empty when none was given (the UI shows a fallback). */
  message: string;
  requestId: string | null;
}

interface FlowState {
  phase: UploadPhase;
  file: File | null;
  contentType: string | null;
  fileError: string | null;
  /** Kept across retries so a failed upload reuses the same draft video. */
  videoId: string | null;
  uploadId: string | null;
  /** True once the thumbnail has been confirmed, so a retry skips re-uploading it. */
  thumbnailUploaded: boolean;
  /** The details of the last start; locked in the UI once the draft video exists. */
  details: UploadDetails | null;
  progress: number;
  failure: UploadFailure | null;
  notice: string | null;
  published: Video | null;
}

const INITIAL: FlowState = {
  phase: "idle",
  file: null,
  contentType: null,
  fileError: null,
  videoId: null,
  uploadId: null,
  thumbnailUploaded: false,
  details: null,
  progress: 0,
  failure: null,
  notice: null,
  published: null,
};

type Action =
  | { type: "file-picked"; file: File; contentType: string }
  | { type: "file-rejected"; message: string }
  | { type: "file-cleared" }
  | { type: "started"; details: UploadDetails }
  | { type: "draft-created"; videoId: string }
  | { type: "thumbnail-uploaded" }
  | { type: "upload-began"; uploadId: string }
  | { type: "progress"; percent: number }
  | { type: "uploaded" }
  | { type: "failed"; stage: UploadFailure["stage"]; message: string; requestId: string | null }
  | { type: "cancelled" }
  | { type: "published"; video: Video }
  | { type: "reset" };

function reducer(state: FlowState, action: Action): FlowState {
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
      return { ...state, phase: "pending", details: action.details, progress: 0, failure: null, notice: null };
    case "draft-created":
      return { ...state, videoId: action.videoId };
    case "thumbnail-uploaded":
      return { ...state, thumbnailUploaded: true };
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
        failure: {
          stage: action.stage,
          at:
            action.stage === "processing"
              ? "PROCESSING"
              : state.phase === "uploading"
                ? "UPLOADING"
                : "PENDING",
          message: action.message,
          requestId: action.requestId,
        },
      };
    case "cancelled":
      return { ...state, phase: "selected", progress: 0, failure: null, notice: "Upload cancelled." };
    case "published":
      return { ...state, phase: "published", published: action.video };
    case "reset":
      return INITIAL;
  }
}

/** A session ready to receive bytes: either a single-PUT target or a multipart plan. */
function hasTarget(session: UploadSession): boolean {
  return session.upload !== null || session.multipart !== null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export function missingTarget(): ApiError {
  return new ApiError({
    status: 200,
    code: CLIENT_ERROR_CODES.unexpected,
    message: "The upload could not be started. Please try again.",
  });
}

/**
 * Get a session we can PUT to: reuse the previous one if it is still active
 * for this file, otherwise initiate a new one. A leftover active session from
 * an interrupted attempt (409 UPLOAD_IN_PROGRESS) is cancelled and replaced.
 */
export async function obtainSession(args: {
  videoId: string;
  file: File;
  contentType: string;
  previousUploadId: string | null;
  signal: AbortSignal;
}): Promise<UploadSession> {
  const { videoId, file, contentType, previousUploadId, signal } = args;

  if (previousUploadId) {
    try {
      const previous = await api.getUpload(previousUploadId, signal);
      const usable =
        (previous.status === "PENDING" || previous.status === "UPLOADING") &&
        previous.filename === file.name &&
        previous.sizeBytes === file.size;
      if (usable && hasTarget(previous)) return previous;
    } catch (error) {
      if (isAbortError(error)) throw error;
      // Session unreadable (gone, expired): start a new one below.
    }
  }

  const request = {
    videoId,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  };

  let session: UploadSession;
  try {
    session = await api.initiateUpload(request, crypto.randomUUID(), signal);
  } catch (error) {
    const staleId = isApiError(error, "UPLOAD_IN_PROGRESS")
      ? error.issueFor("uploadId")
      : undefined;
    if (!staleId) throw error;
    await api.cancelUpload(staleId);
    session = await api.initiateUpload(request, crypto.randomUUID(), signal);
  }
  if (!hasTarget(session)) throw missingTarget();
  return session;
}

/**
 * Uploads the required thumbnail as its own presigned session, then confirms
 * it. A thumbnail is small and never processed, so there is no progress or
 * polling: it must land before the video upload because the API allows only
 * one in-flight session per video. A leftover in-flight session (from an
 * interrupted earlier attempt) is cancelled and replaced.
 */
async function uploadThumbnail(args: {
  videoId: string;
  file: File;
  contentType: string;
  signal: AbortSignal;
}): Promise<void> {
  const { videoId, file, contentType, signal } = args;
  const request = {
    videoId,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
    assetKind: "THUMBNAIL" as const,
  };

  let session: UploadSession;
  try {
    session = await api.initiateUpload(request, crypto.randomUUID(), signal);
  } catch (error) {
    const staleId = isApiError(error, "UPLOAD_IN_PROGRESS")
      ? error.issueFor("uploadId")
      : undefined;
    if (!staleId) throw error;
    await api.cancelUpload(staleId);
    session = await api.initiateUpload(request, crypto.randomUUID(), signal);
  }
  if (!hasTarget(session)) throw missingTarget();

  // A thumbnail is always below the multipart threshold, so it has a single-PUT target.
  if (!session.upload) throw missingTarget();
  await putFileToSignedUrl(session.upload, file, { signal });
  await completeWithRetry(session.id, signal);
}

/**
 * Transfers the file to a session's target and confirms it, choosing the path the server picked:
 * a single PUT for small files, or a part-by-part multipart upload for large ones. Progress is
 * reported 0..100 across the whole transfer. Returns the complete response (processing status).
 */
export async function transferAndComplete(
  session: UploadSession,
  file: File,
  options: { signal: AbortSignal; onProgress: (percent: number) => void },
) {
  const { signal, onProgress } = options;
  if (session.multipart) {
    const parts = await putPartsToSignedUrls(session.multipart, file, { signal, onProgress });
    return completeMultipartWithRetry(session.id, parts, signal);
  }
  if (!session.upload) throw missingTarget();
  await putFileToSignedUrl(session.upload, file, { signal, onProgress });
  return completeWithRetry(session.id, signal);
}

export async function completeWithRetry(uploadId: string, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.completeUpload(uploadId, signal);
    } catch (error) {
      const retryable =
        isApiError(error) && COMPLETE_RETRY_CODES.has(error.code) && attempt < COMPLETE_RETRIES;
      if (!retryable) throw error;
      await sleep(1500 * (attempt + 1), signal);
    }
  }
}

/** Same retry policy as {@link completeWithRetry}, for the multipart confirmation endpoint. */
export async function completeMultipartWithRetry(
  uploadId: string,
  parts: CompletedUploadPart[],
  signal: AbortSignal,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api.completeMultipartUpload(uploadId, parts, signal);
    } catch (error) {
      const retryable =
        isApiError(error) && COMPLETE_RETRY_CODES.has(error.code) && attempt < COMPLETE_RETRIES;
      if (!retryable) throw error;
      await sleep(1500 * (attempt + 1), signal);
    }
  }
}

function toFailure(error: unknown, stage: UploadFailure["stage"]) {
  return {
    type: "failed",
    stage,
    message: error instanceof ApiError ? error.message : "",
    requestId: error instanceof ApiError ? error.requestId : null,
  } as const;
}

/**
 * Orchestrates the upload journey: create the draft video, initiate the
 * upload, PUT the file to its signed URL, confirm it, then poll processing.
 * Each step maps to a phase of the design's state machine; `view` merges the
 * polled processing status into the phase (processing -> ready or failed).
 */
export function useUploadFlow() {
  const queryClient = useQueryClient();
  const [state, dispatch] = React.useReducer(reducer, INITIAL);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const polling = state.phase === "processing" && state.videoId !== null;
  const statusQuery = useQuery({
    queryKey: processingStatusKey(state.videoId),
    queryFn: ({ signal }) => {
      if (!state.videoId) throw missingTarget();
      return api.getProcessingStatus(state.videoId, signal);
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
      failure = {
        stage: "processing",
        at: "PROCESSING",
        message: status.failure?.message ?? "",
        requestId: null,
      };
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

  /** Run (or re-run) the upload for the current file with the given details. */
  const start = React.useCallback(
    async (details: UploadDetails) => {
      const { file, contentType, uploadId: previousUploadId } = state;
      if (!file || !contentType) return;

      const thumbnailCheck = checkThumbnailFile(details.thumbnail);
      if (!thumbnailCheck.ok) {
        dispatch({ type: "failed", stage: "upload", message: thumbnailCheck.message, requestId: null });
        return;
      }

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;
      const { signal } = controller;

      dispatch({ type: "started", details });
      let videoId = state.videoId;
      try {
        if (!videoId) {
          const video = await api.createVideo(
            { type: details.type, title: details.title, isAiGenerated: details.isAiGenerated },
            signal,
          );
          videoId = video.id;
          dispatch({ type: "draft-created", videoId });
        }

        // The thumbnail is uploaded first and only once: the API allows a single
        // in-flight session per video, so it must finish before the video upload.
        if (!state.thumbnailUploaded) {
          await uploadThumbnail({
            videoId,
            file: details.thumbnail,
            contentType: thumbnailCheck.contentType,
            signal,
          });
          dispatch({ type: "thumbnail-uploaded" });
        }

        const session = await obtainSession({
          videoId,
          file,
          contentType,
          previousUploadId,
          signal,
        });
        dispatch({ type: "upload-began", uploadId: session.id });

        // Small files upload in one PUT; large files upload in parts (multipart). The server's
        // session shape picks the path, so the UI code is the same for both.
        const result = await transferAndComplete(session, file, {
          signal,
          onProgress: (percent) => dispatch({ type: "progress", percent }),
        });
        queryClient.setQueryData(processingStatusKey(videoId), result.processing);
        dispatch({ type: "uploaded" });
      } catch (error) {
        if (isAbortError(error)) return;
        dispatch(toFailure(error, "upload"));
      }
    },
    [state, queryClient],
  );

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
    statusQuery: {
      percent: status?.progressPercent ?? 0,
      error: statusQuery.isError,
      retry: () => void statusQuery.refetch(),
    },
    pickFile,
    start,
    cancel,
    clearFile: () => dispatch({ type: "file-cleared" }),
    published: (video: Video) => dispatch({ type: "published", video }),
    reset: () => dispatch({ type: "reset" }),
  };
}
