import { AUTH_BASE_PATH } from "@/lib/auth/constants";
import { restoreSession } from "@/lib/auth/session";
import { clearSession, setSession } from "@/lib/auth/session-store";
import type {
  AnalyticsPoint,
  AppNotification,
  AuthSession,
  CompletedUploadPart,
  CompleteUploadResponse,
  CreateVideoRequest,
  Creator,
  CreatorComment,
  CreatorStats,
  HomeFeed,
  InitiateUploadRequest,
  LikeResponse,
  LinkTrailerRequest,
  LoginRequest,
  Paginated,
  ProcessingStatusResponse,
  PublicationStatus,
  PublishVideoRequest,
  RecordViewEventRequest,
  RegisterRequest,
  Series,
  UploadSession,
  Video,
  VideoType,
} from "@/types/domain";
import { isApiError } from "./errors";
import { asContract, requestJson, requestVoid } from "./http";
import type { RequestOptions } from "./http";
import {
  authSessionSchema,
  completeUploadSchema,
  processingStatusSchema,
  uploadSessionSchema,
} from "./schemas";
import {
  creators,
  mockCreatorComments,
  mockNotifications,
  mockMyContent,
  mockVideos,
  mockViewsSeries,
  mockWatchlist,
} from "./mock-data";

/**
 * Typed API client for AI Drama.
 *
 * LIVE (real Spring Boot calls, API-CONTRACT.md): auth, creator videos,
 * uploads, processing status, publish, home feed, public video lists, video by
 * slug, related videos, series list and detail, view events, likes, and search.
 *
 * STILL MOCK (outside the signup -> upload -> process -> watch slice): channel,
 * watchlist, notifications, creator dashboard stats, analytics series, creator
 * comments, and `listMyContent` (kept for the Studio overview and analytics
 * pages; the live My Content page uses `listCreatorVideos`).
 *
 * Transport (base URL, auth header, 401 -> refresh -> retry, error envelope)
 * lives in ./http.ts; this file only maps endpoints to typed functions.
 */

/** The genre list shown in filters and accepted by the API (spec 3.15). */
export const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Romance",
  "Science Fiction",
  "Thriller",
  "Historical",
  "Family",
] as const;

/**
 * A bare gateway 502 (Cloudflare's "origin_bad_gateway") can be returned after
 * the origin has already acted on an idempotent request, so the browser sees a
 * failure for work that actually succeeded. These bound a short client-side
 * retry for such requests; the retry is cheap because the operation is
 * idempotent at the origin.
 */
const GATEWAY_502_RETRIES = 2;
const GATEWAY_502_RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** True for a Cloudflare/gateway 502 with no application error code of its own. */
function isGateway502(error: unknown): boolean {
  return isApiError(error) && error.status === 502;
}

export type SortKey = "popular" | "recent" | "liked";

export interface VideoQuery {
  type?: VideoType;
  genre?: string;
  sort?: SortKey;
  page?: number;
}

export interface CreatorVideoQuery {
  page?: number;
  pageSize?: number;
  status?: PublicationStatus;
  /** Case-insensitive substring match on the title. Blank lists everything. */
  q?: string;
}

/** Number of related titles shown beside the player. */
const RELATED_COUNT = 4;

/** Search shows a single page of matches; 50 is the API's max page size. */
const SEARCH_RESULT_LIMIT = 50;

/** Simulate network latency for the methods that are still mocked. */
function delay<T>(value: T, ms = 400): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function publishedMocks(): Video[] {
  return mockVideos.filter(
    (v) => v.publicationStatus === "PUBLISHED" && v.visibility === "PUBLIC",
  );
}

/** Map a 404 to null; rethrow everything else. */
async function nullOnNotFound<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

const parseVideo = asContract<Video>;
const parsePage = asContract<Paginated<Video>>;

export const api = {
  /* ------------------------------ Auth ----------------------------------- */

  /** POST /auth/register (via /api/auth/register). Logs the user in. */
  async register(request: RegisterRequest): Promise<AuthSession> {
    const session = await requestJson(
      { baseUrl: AUTH_BASE_PATH, path: "/register", method: "POST", body: request },
      (json) => authSessionSchema.parse(json),
    );
    setSession(session);
    return session;
  },

  /** POST /auth/login (via /api/auth/login). A 401 INVALID_CREDENTIALS never triggers a refresh. */
  async login(request: LoginRequest): Promise<AuthSession> {
    const session = await requestJson(
      { baseUrl: AUTH_BASE_PATH, path: "/login", method: "POST", body: request },
      (json) => authSessionSchema.parse(json),
    );
    setSession(session);
    return session;
  },

  /** Discard both tokens (the API logout is stateless). The session is cleared even if the call fails. */
  async logout(): Promise<void> {
    try {
      await requestVoid({ baseUrl: AUTH_BASE_PATH, path: "/logout", method: "POST" });
    } finally {
      clearSession();
    }
  },

  /** Restore the session after a page load; resolves the user or null. Browser only. */
  restoreSession,

  /** POST /auth/verify-email. 204; 400 INVALID_VERIFICATION_TOKEN when invalid or expired. */
  async verifyEmail(token: string): Promise<void> {
    await requestVoid({
      path: "/auth/verify-email",
      method: "POST",
      body: { token },
    });
  },

  /** POST /auth/resend-verification. Needs a session; 409 EMAIL_ALREADY_VERIFIED when done. */
  async resendVerification(): Promise<void> {
    await requestVoid({
      path: "/auth/resend-verification",
      method: "POST",
      auth: "required",
    });
  },

  /* --------------------------- Public discovery -------------------------- */

  /** Home page feed: hero, stats, and rails. GET /home. `featured` is null for an empty catalogue. */
  async getHomeFeed(): Promise<HomeFeed> {
    return requestJson({ path: "/home" }, asContract<HomeFeed>);
  },

  /** Public discovery grid. GET /videos. */
  async listPublishedVideos(page = 1): Promise<Paginated<Video>> {
    return requestJson(
      { path: "/videos", query: { sort: "popular", page } },
      parsePage,
    );
  },

  /** Filtered + sorted listing for Explore/Movies/Shorts. GET /videos. */
  async listVideos(query: VideoQuery = {}): Promise<Paginated<Video>> {
    const { type, genre, sort = "popular", page = 1 } = query;
    return requestJson(
      { path: "/videos", query: { type, genre, sort, page } },
      parsePage,
    );
  },

  /**
   * Single video by slug. GET /videos/{slug}; a 404 resolves to null.
   * In the browser a valid token is sent so an owner can open their own draft.
   */
  async getVideoBySlug(slug: string): Promise<Video | null> {
    return nullOnNotFound(() =>
      requestJson(
        { path: `/videos/${encodeURIComponent(slug)}`, auth: "optional" },
        parseVideo,
      ),
    );
  },

  /**
   * POST /videos/{slug}/view-events. Anonymous or signed in; a token, when the
   * browser has one, identifies the viewer. The `{ recorded, counted }` body is
   * discarded on purpose: the response never carries the new count, and
   * `viewCount` stays display data from GET /videos/{slug}.
   * A 401 means the sent token was rejected, so the call is repeated once as
   * an anonymous visitor. 400 and 404 reject; callers decide whether to ignore.
   */
  async recordViewEvent(
    slug: string,
    request: RecordViewEventRequest,
  ): Promise<void> {
    const options: RequestOptions = {
      path: `/videos/${encodeURIComponent(slug)}/view-events`,
      method: "POST",
      body: request,
    };
    try {
      await requestVoid({ ...options, auth: "optional" });
    } catch (error) {
      if (!isApiError(error) || error.status !== 401) throw error;
      await requestVoid({ ...options, auth: "none" });
    }
  },

  /**
   * POST /videos/{slug}/like. Signed-in viewers only (401 otherwise); 404 for
   * a video that is missing, not public, or deleted. Idempotent. The returned
   * `likeCount` is authoritative.
   */
  async likeVideo(slug: string): Promise<LikeResponse> {
    return requestJson(
      {
        path: `/videos/${encodeURIComponent(slug)}/like`,
        method: "POST",
        auth: "required",
      },
      asContract<LikeResponse>,
    );
  },

  /** DELETE /videos/{slug}/like. Same auth, errors, and response as `likeVideo`. */
  async unlikeVideo(slug: string): Promise<LikeResponse> {
    return requestJson(
      {
        path: `/videos/${encodeURIComponent(slug)}/like`,
        method: "DELETE",
        auth: "required",
      },
      asContract<LikeResponse>,
    );
  },

  /**
   * Titles for the watch page sidebar. The API has no "related" endpoint, so
   * this takes the most popular public videos and drops the current one.
   */
  async getRelatedVideos(excludeId: string): Promise<Video[]> {
    const { data } = await requestJson(
      { path: "/videos", query: { sort: "popular", pageSize: RELATED_COUNT + 1 } },
      parsePage,
    );
    return data.filter((v) => v.id !== excludeId).slice(0, RELATED_COUNT);
  },

  /**
   * Drama series, newest first, optionally narrowed to one genre. GET /series
   * returns a pagination envelope; this unwraps `data`.
   */
  async listSeries(query: { genre?: string } = {}): Promise<Series[]> {
    const page = await requestJson(
      { path: "/series", query: { genre: query.genre } },
      asContract<Paginated<Series>>,
    );
    return page.data;
  },

  /** A series plus its episodes. GET /series/{slug}; a 404 resolves to null. */
  async getSeriesBySlug(
    slug: string,
  ): Promise<{ series: Series; episodes: Video[] } | null> {
    return nullOnNotFound(() =>
      requestJson(
        { path: `/series/${encodeURIComponent(slug)}` },
        asContract<{ series: Series; episodes: Video[] }>,
      ),
    );
  },

  /* ----------------------- Creator videos and uploads -------------------- */

  /** POST /creator/videos. Creates a DRAFT / PENDING video. */
  async createVideo(
    request: CreateVideoRequest,
    signal?: AbortSignal,
  ): Promise<Video> {
    return requestJson(
      { path: "/creator/videos", method: "POST", body: request, auth: "required", signal },
      parseVideo,
    );
  },

  /**
   * GET /creator/videos. The signed-in creator's videos, newest first.
   * `q` searches titles server-side, so `pagination.totalItems` is the real
   * match count rather than a count of the page in hand.
   */
  async listCreatorVideos(
    query: CreatorVideoQuery = {},
    signal?: AbortSignal,
  ): Promise<Paginated<Video>> {
    const { page = 1, pageSize = 20, status, q } = query;
    return requestJson(
      {
        path: "/creator/videos",
        // `buildUrl` omits undefined and empty values, so a blank `q` is not sent.
        query: { page, pageSize, status, q },
        auth: "required",
        signal,
      },
      parsePage,
    );
  },

  /** POST /creator/videos/{id}/publish. 422 VIDEO_NOT_READY / GENRE_REQUIRED / VISIBILITY_REQUIRED. */
  async publishVideo(
    videoId: string,
    request: PublishVideoRequest,
  ): Promise<Video> {
    return requestJson(
      {
        path: `/creator/videos/${encodeURIComponent(videoId)}/publish`,
        method: "POST",
        body: request,
        auth: "required",
      },
      parseVideo,
    );
  },

  /**
   * DELETE /creator/videos/{id}. Soft-deletes the video. 204 on success.
   *
   * The call is behind Cloudflare, which can return a 502 after the origin has
   * already soft-deleted the row (the request reaches the origin; only the
   * response is lost). Because soft-delete is not idempotent on the origin, a
   * retry then finds the row already gone and answers 404. Both outcomes mean
   * the video is deleted, so a 502 is retried briefly and a follow-up 404 is
   * treated as success. A 404 on the very first attempt (nothing was deleted)
   * still surfaces, so deleting a video that was never there is not masked.
   */
  async deleteVideo(videoId: string): Promise<void> {
    const options: RequestOptions = {
      path: `/creator/videos/${encodeURIComponent(videoId)}`,
      method: "DELETE",
      auth: "required",
    };

    for (let attempt = 0; ; attempt++) {
      try {
        await requestVoid(options);
        return;
      } catch (error) {
        // A 404 after a 502 retry means the earlier attempt already deleted it.
        if (attempt > 0 && isApiError(error) && error.status === 404) return;
        if (isGateway502(error) && attempt < GATEWAY_502_RETRIES) {
          await sleep(GATEWAY_502_RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
    }
  },

  /**
   * POST /creator/videos/{titleId}/trailer. Links one of the creator's TRAILER
   * videos to a title; the trailer need not be READY. Returns the title with
   * its new `version`. Linking the current trailer again is a no-op 200.
   * 409 TRAILER_ALREADY_LINKED / TRAILER_DELETED; 422 TRAILER_NOT_FOUND /
   * NOT_A_TRAILER / TRAILER_SELF_LINK / TRAILER_NESTING_NOT_ALLOWED / VIDEO_REMOVED.
   */
  async linkTrailer(
    titleId: string,
    trailerVideoId: string,
    signal?: AbortSignal,
  ): Promise<Video> {
    const body: LinkTrailerRequest = { trailerVideoId };
    return requestJson(
      {
        path: `/creator/videos/${encodeURIComponent(titleId)}/trailer`,
        method: "POST",
        body,
        auth: "required",
        signal,
      },
      parseVideo,
    );
  },

  /**
   * DELETE /creator/videos/{titleId}/trailer. Clears the link and keeps the
   * trailer video. Idempotent: a title without a trailer returns 200 unchanged.
   */
  async unlinkTrailer(titleId: string, signal?: AbortSignal): Promise<Video> {
    return requestJson(
      {
        path: `/creator/videos/${encodeURIComponent(titleId)}/trailer`,
        method: "DELETE",
        auth: "required",
        signal,
      },
      parseVideo,
    );
  },

  /** POST /uploads/initiate. The Idempotency-Key makes a network retry return the same session. */
  async initiateUpload(
    request: InitiateUploadRequest,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<UploadSession> {
    return requestJson(
      {
        path: "/uploads/initiate",
        method: "POST",
        body: request,
        headers: { "Idempotency-Key": idempotencyKey },
        auth: "required",
        signal,
      },
      (json) => uploadSessionSchema.parse(json),
    );
  },

  /** GET /uploads/{id}. The signed URL is re-signed on every call. */
  async getUpload(uploadId: string, signal?: AbortSignal): Promise<UploadSession> {
    return requestJson(
      { path: `/uploads/${encodeURIComponent(uploadId)}`, auth: "required", signal },
      (json) => uploadSessionSchema.parse(json),
    );
  },

  /** POST /uploads/{id}/complete. Idempotent, safe to retry. */
  async completeUpload(
    uploadId: string,
    signal?: AbortSignal,
  ): Promise<CompleteUploadResponse> {
    return requestJson(
      {
        path: `/uploads/${encodeURIComponent(uploadId)}/complete`,
        method: "POST",
        auth: "required",
        signal,
      },
      (json) => completeUploadSchema.parse(json),
    );
  },

  /**
   * POST /uploads/{id}/complete-multipart. Confirms a chunked upload with every part's number and
   * the ETag the storage returned for it. Idempotent, safe to retry.
   */
  async completeMultipartUpload(
    uploadId: string,
    parts: CompletedUploadPart[],
    signal?: AbortSignal,
  ): Promise<CompleteUploadResponse> {
    return requestJson(
      {
        path: `/uploads/${encodeURIComponent(uploadId)}/complete-multipart`,
        method: "POST",
        body: { parts },
        auth: "required",
        signal,
      },
      (json) => completeUploadSchema.parse(json),
    );
  },

  /** POST /uploads/{id}/cancel. 409 UPLOAD_ALREADY_COMPLETED when too late. */
  async cancelUpload(uploadId: string): Promise<UploadSession> {
    return requestJson(
      {
        path: `/uploads/${encodeURIComponent(uploadId)}/cancel`,
        method: "POST",
        auth: "required",
      },
      (json) => uploadSessionSchema.parse(json),
    );
  },

  /** GET /videos/{id}/processing-status. Owner only. */
  async getProcessingStatus(
    videoId: string,
    signal?: AbortSignal,
  ): Promise<ProcessingStatusResponse> {
    return requestJson(
      {
        path: `/videos/${encodeURIComponent(videoId)}/processing-status`,
        auth: "required",
        signal,
      },
      (json) => processingStatusSchema.parse(json),
    );
  },

  /* ------------------------------- Mocks --------------------------------- */

  /**
   * Global search across titles, descriptions, genres, and creators (spec 3.14).
   * GET /search returns a pagination envelope; this unwraps the first page's
   * `data`. A blank query matches nothing, so no request is made. In the browser
   * a valid token is sent so `isLiked` is filled for a signed-in viewer.
   */
  async search(q: string, signal?: AbortSignal): Promise<Video[]> {
    const needle = q.trim();
    if (!needle) return [];
    const { data } = await requestJson(
      {
        path: "/search",
        query: { q: needle, pageSize: SEARCH_RESULT_LIMIT },
        auth: "optional",
        signal,
      },
      parsePage,
    );
    return data;
  },

  /** A creator channel: profile + their published videos (spec 3.2, 3.18). MOCK. */
  async getChannel(
    username: string,
  ): Promise<{ creator: Creator; videos: Video[] } | null> {
    const creator = creators.find((c) => c.username === username);
    if (!creator) return delay(null);
    const videos = publishedMocks().filter((v) => v.creator.id === creator.id);
    return delay({ creator, videos });
  },

  /** The viewer's saved watchlist (spec 3.20). MOCK. */
  async getWatchlist(): Promise<Video[]> {
    return delay(mockWatchlist);
  },

  /** In-app notifications (spec 3.21). MOCK. */
  async listNotifications(): Promise<AppNotification[]> {
    return delay(mockNotifications);
  },

  /** Creator Studio overview stats (spec 7.3 dashboard). MOCK. */
  async getCreatorStats(): Promise<CreatorStats> {
    return delay({
      totalViews: 104200,
      publishedCount: 12,
      draftCount: 4,
      followerCount: 850,
    });
  },

  /** Content list for the Studio overview and analytics pages. MOCK; My Content uses `listCreatorVideos`. */
  async listMyContent(): Promise<Video[]> {
    return delay(mockMyContent);
  },

  /** Views-over-time for creator analytics (spec 3.22). MOCK. */
  async getViewsSeries(): Promise<AnalyticsPoint[]> {
    return delay(mockViewsSeries);
  },

  /** Recent comments across the creator's videos (spec 3.17). MOCK. */
  async listCreatorComments(): Promise<CreatorComment[]> {
    return delay(mockCreatorComments);
  },
};
