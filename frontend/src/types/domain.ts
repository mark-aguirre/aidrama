/**
 * Core domain types for AI Drama.
 * These mirror the entities and enums defined in the product spec
 * (sections 6.3, 6.6, 7). The mock API layer returns these shapes so the
 * real Spring Boot client can later be swapped in with no UI changes.
 */

export type VideoType = "MOVIE" | "EPISODE" | "SHORT" | "TRAILER" | "TEASER";

export type PublicationStatus =
  | "DRAFT"
  | "PROCESSING"
  | "READY"
  | "PUBLISHED"
  | "UNPUBLISHED"
  | "FAILED"
  | "REMOVED";

export type Visibility = "PUBLIC" | "UNLISTED" | "PRIVATE";

/** Upload / processing lifecycle shown in the Creator Studio (spec 3.7). */
export type ProcessingStatus =
  | "PENDING"
  | "UPLOADING"
  | "PROCESSING"
  | "READY"
  | "FAILED";

export interface Creator {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  followerCount: number;
}

/**
 * The playable trailer of a title (API-CONTRACT.md "Inline trailer"). Present
 * only when the trailer is live, processed, and has a stream, so `hlsUrl` is
 * never null. `thumbnailUrl` may be null: fall back to the title's thumbnail.
 */
export interface TrailerSummary {
  id: string;
  title: string;
  hlsUrl: string;
  thumbnailUrl: string | null;
  durationSeconds: number;
}

/**
 * A video as returned by the API (API-CONTRACT.md "Shapes").
 *
 * "Not available yet" values: `genre` is "" until set, `durationSeconds` is 0
 * until processing reports it, `thumbnailUrl`/`hlsUrl` are null until
 * processing has produced them, and `publishedAt` is null until published.
 */
export interface Video {
  id: string;
  slug: string;
  title: string;
  description: string;
  type: VideoType;
  thumbnailUrl: string | null;
  /** HLS master playlist URL served to the player. */
  hlsUrl: string | null;
  durationSeconds: number;
  genre: string;
  language: string;
  visibility: Visibility;
  publicationStatus: PublicationStatus;
  processingStatus: ProcessingStatus;
  isAiGenerated: boolean;
  viewCount: number;
  likeCount: number;
  /**
   * Whether the requesting viewer has liked this video. Always false for
   * anonymous requests and on `/creator/**`, so a server-rendered response
   * (which carries no token) is never the viewer's own state.
   */
  isLiked: boolean;
  publishedAt: string | null;
  createdAt: string;
  creator: Creator;
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** Optimistic-locking version; send it back on PUT /creator/videos/{id}. */
  version: number;
  /**
   * Linked trailer id. On public reads it equals `trailer.id` and is null
   * without a playable trailer; on creator reads it is also set while the
   * linked trailer is still uploading or processing (then `trailer` is null).
   */
  trailerVideoId: string | null;
  /** Playable trailer for the "Watch trailer" button, or null. */
  trailer: TrailerSummary | null;
}

/** Aggregated stats for the Creator Studio overview (spec 3.3). */
export interface CreatorStats {
  totalViews: number;
  publishedCount: number;
  draftCount: number;
  followerCount: number;
}

/** A drama series grouping seasons and episodes (spec 6.4). */
export interface Series {
  id: string;
  slug: string;
  title: string;
  description: string;
  posterUrl: string | null;
  genre: string;
  seasonCount: number;
  episodeCount: number;
  creator: Creator;
}

/** An in-app notification (spec 3.21). */
export type NotificationType =
  | "NEW_FOLLOWER"
  | "NEW_COMMENT"
  | "COMMENT_REPLY"
  | "CONTENT_LIKED"
  | "CREATOR_PUBLISHED"
  | "PROCESSING_COMPLETE"
  | "PROCESSING_FAILED"
  | "MODERATION_NOTICE";

export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;
}

/** A comment left on a creator's video, shown in the Studio (spec 3.17). */
export interface CreatorComment {
  id: string;
  authorName: string;
  videoTitle: string;
  body: string;
  createdAt: string;
}

/** A single point on a views-over-time chart (spec 3.22). */
export interface AnalyticsPoint {
  date: string;
  views: number;
}

/** Featured title shown in the home hero. `backdropUrl` is "" when the video has no thumbnail. */
export interface FeaturedTitle {
  video: Video;
  backdropUrl: string;
  kicker: string;
  tagline: string;
}

/** A headline platform number on the home hero. */
export interface PlatformStat {
  value: string;
  label: string;
}

/** Everything the home page needs in one call. Maps to GET /home (spec 7.2). */
export interface HomeFeed {
  /** Null while the catalogue is empty. */
  featured: FeaturedTitle | null;
  stats: PlatformStat[];
  trending: Video[];
  originals: Video[];
}

/** Standard paginated envelope from the API (spec 7.12). */
export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
  };
}

/* -------------------------------------------------------------------------- */
/* Error envelope (API-CONTRACT.md "Conventions")                              */
/* -------------------------------------------------------------------------- */

/** One field-level issue; `field` is the JSON property name. */
export interface ApiErrorDetail {
  field: string;
  issue: string;
}

/** Body of every non-2xx API response. Branch on `code`, show `message`. */
export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details: ApiErrorDetail[];
  };
}

/* -------------------------------------------------------------------------- */
/* Auth (API-CONTRACT.md "Authentication", "Auth")                             */
/* -------------------------------------------------------------------------- */

/** The signed-in user. Contains the private email; only ever returned to the user. */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  roles: string[];
  emailVerified: boolean;
  createdAt: string;
}

/** Response of register, login, and refresh as sent by the API. */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** Access token lifetime in seconds (900). */
  expiresIn: number;
  user: AuthUser;
}

/**
 * What the browser receives from the Next.js auth route handlers: an
 * AuthResponse without the refresh token, which stays in an HttpOnly cookie.
 */
export type AuthSession = Omit<AuthResponse, "refreshToken">;

export interface RegisterRequest {
  email: string;
  username: string;
  displayName: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/* -------------------------------------------------------------------------- */
/* Creator videos and uploads                                                  */
/* -------------------------------------------------------------------------- */

/** `EPISODE` cannot be created yet (422 EPISODE_NOT_SUPPORTED). */
export type CreatableVideoType = Exclude<VideoType, "EPISODE">;

export interface CreateVideoRequest {
  type: CreatableVideoType;
  title: string;
  description?: string;
  genre?: string;
  language?: string;
  visibility?: Visibility;
  isAiGenerated: boolean;
}

/** A published video must end up PUBLIC or UNLISTED. */
export interface PublishVideoRequest {
  genre?: string;
  visibility?: Exclude<Visibility, "PRIVATE">;
}

/** Body of POST /creator/videos/{titleId}/trailer. */
export interface LinkTrailerRequest {
  trailerVideoId: string;
}

/** Playback milestones accepted by POST /videos/{slug}/view-events. Only VIEW_QUALIFIED counts as a view. */
export type ViewEventType = "PLAY_START" | "VIEW_QUALIFIED" | "PLAY_COMPLETE";

/** Body of POST /videos/{slug}/view-events. `watchedSeconds` is an integer 0..86400. */
export interface RecordViewEventRequest {
  eventType: ViewEventType;
  watchedSeconds: number;
  /** Anonymous viewer id, 16..64 chars of [A-Za-z0-9_-]. Required when signed out; the API ignores it when signed in. */
  sessionId: string;
}

/**
 * Body of POST and DELETE /videos/{slug}/like. `likeCount` is the
 * authoritative total after the change; the client reconciles to it.
 */
export interface LikeResponse {
  liked: boolean;
  likeCount: number;
}

export type UploadStatus =
  | "PENDING"
  | "UPLOADING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

/** Why an upload or processing job failed. */
export interface FailureReason {
  code: string;
  message: string;
}

/** The signed target for the browser PUT. Null once the session is no longer usable. */
export interface UploadTarget {
  url: string;
  method: "PUT";
  /** Exactly these headers (Content-Type) and nothing else must be sent. */
  headers: Record<string, string>;
}

/** One presigned part PUT of a chunked upload: its 1-based number and signed URL. */
export interface UploadPartTarget {
  partNumber: number;
  url: string;
}

/**
 * A chunked (S3 multipart) upload plan, present instead of `upload` when the file is large enough
 * to exceed a single request's body limit (a proxy such as Cloudflare caps at 100 MB). The browser
 * PUTs each slice of `partSizeBytes` to its `parts[i].url` (the last part is the remainder), reads
 * the `ETag` response header of each, and sends them to POST /uploads/{id}/complete-multipart.
 */
export interface UploadMultipart {
  partSizeBytes: number;
  totalParts: number;
  parts: UploadPartTarget[];
}

/** What an upload delivers: the source video or a creator-supplied thumbnail image. */
export type AssetKind = "VIDEO" | "THUMBNAIL";

export interface UploadSession {
  id: string;
  videoId: string;
  status: UploadStatus;
  assetKind: AssetKind;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBytes: number;
  /** The single-PUT target for small files. Null when `multipart` is set or the session is done. */
  upload: UploadTarget | null;
  /** The chunked-upload plan for large files. Null when `upload` is set or the session is done. */
  multipart: UploadMultipart | null;
  expiresAt: string;
  completedAt: string | null;
  failure: FailureReason | null;
  createdAt: string;
}

/** One finished part reported on complete: its 1-based number and the storage-returned ETag. */
export interface CompletedUploadPart {
  partNumber: number;
  eTag: string;
}

export interface InitiateUploadRequest {
  videoId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Omitted or "VIDEO" uploads the source file; "THUMBNAIL" uploads the poster image. */
  assetKind?: AssetKind;
}

export type JobStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

/**
 * Response of GET /videos/{id}/processing-status. Named `...Response` because
 * `ProcessingStatus` is already the enum of lifecycle values above.
 */
export interface ProcessingStatusResponse {
  videoId: string;
  processingStatus: ProcessingStatus;
  publicationStatus: PublicationStatus;
  /** Null before an upload is confirmed. */
  jobStatus: JobStatus | null;
  progressPercent: number;
  failure: FailureReason | null;
  updatedAt: string;
}

/** Response of POST /uploads/{id}/complete. */
export interface CompleteUploadResponse {
  upload: UploadSession;
  processing: ProcessingStatusResponse;
}
