# AI Drama API contract (MVP thin slice)

Consumer: `frontend/` (Next.js). Source of truth for shapes: `frontend/src/types/domain.ts`. Machine-readable
OpenAPI 3 is served at `GET /v3/api-docs` (enabled by default, disable with `AIDRAMA_API_DOCS_ENABLED=false`).

- Base URL (dev): `http://localhost:8080/api/v1` (matches `NEXT_PUBLIC_API_BASE_URL` in `frontend/.env.example`)
- All bodies are `application/json`, UTF-8. Timestamps are ISO-8601 UTC instants (`2026-11-07T05:30:44.154Z`). Ids are UUID strings.
- JSON field names are camelCase. `null` fields are always present, never omitted.
- Unknown request fields are ignored. Unknown query parameters are ignored.

## Authentication

| Item | Value |
|---|---|
| Scheme | Bearer access token (signed JWT, HS256) in `Authorization: Bearer <accessToken>` |
| Access token lifetime | 900 s (`expiresIn` in the auth responses) |
| Refresh token | Signed JWT string, sent in the body of `POST /auth/refresh`. Lifetime 14 days, and the session ends 30 days after login at the latest |
| Refresh flow | On a `401` with `error.code = UNAUTHENTICATED` from any protected call: call `POST /auth/refresh` once, store BOTH new tokens (the old refresh token is replaced), retry the original request once. If refresh returns `401` (`INVALID_REFRESH_TOKEN` or `SESSION_EXPIRED`), clear the session and send the user to login |
| Do not refresh on | `401 INVALID_CREDENTIALS` (wrong login) |
| Logout | `POST /auth/logout` returns 204 and does nothing on the server. Tokens are stateless, so the client must discard both. A stolen refresh token stays valid until it expires (see Known limitations) |
| Roles | `USER`, `CREATOR` (both are granted at registration). `/creator/*` and `/uploads/*` need `CREATOR`. Roles come from the token only, never from the request |
| Public endpoints | `/home`, `GET /videos`, `GET /videos/{slug}`, `GET /series`, `GET /series/{slug}`, register, login, refresh, logout, verify-email |
| Token storage advice | Keep the refresh token out of `localStorage` (XSS). Use memory, or have a Next.js route handler hold it in an `HttpOnly` cookie and call this API server-side |
| Sending a token to public endpoints | Optional. A valid token on `GET /videos/{slug}` lets the owner open their own private or draft video. An invalid or expired token on a public endpoint gets `401`, so do not send a token you know is expired |
| CORS | Allowed origins come from `AIDRAMA_CORS_ALLOWED_ORIGINS` (dev default `http://localhost:3000`). Allowed headers: `Authorization`, `Content-Type`, `Idempotency-Key`, `X-Request-ID`. Exposed header: `X-Request-ID` |

## Conventions

**Correlation.** Send `X-Request-ID` (8 to 64 chars of `A-Za-z0-9._-`) or the server generates one. It is echoed in the
response header and in `error.requestId`.

**Error format** (every non-2xx response, including 401 and 403):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "requestId": "b3f1c2a0-0f5e-4a38-9c1e-4d3c1c3b9d11",
    "details": [ { "field": "password", "issue": "must be 8 to 72 characters" } ]
  }
}
```

`details` is always an array (empty when there are no field issues). `field` is the JSON property name, so it can be
mapped straight onto a form field. Show `message` to users; branch on `code`.

**Pagination envelope** (same as `Paginated<T>` in `domain.ts`). Query: `page` (1-based, default 1), `pageSize`
(default 20, max 50). `page < 1` or `pageSize` outside 1..50 returns 400. A page past the end returns `data: []`.

```json
{ "data": [], "pagination": { "page": 1, "pageSize": 20, "totalItems": 135, "totalPages": 7, "hasNext": true } }
```

`totalPages` is at least 1.

**Idempotency.** `POST /uploads/initiate` accepts `Idempotency-Key` (8 to 64 chars of `A-Za-z0-9._:-`). `POST /uploads/{id}/complete`
is naturally idempotent (safe to retry). Other POSTs are not idempotent.

**Optimistic locking.** `Video.version` must be sent back on `PUT /creator/videos/{id}`; a stale value returns `409 CONCURRENT_MODIFICATION`.

## Enums

| Enum | Values |
|---|---|
| `VideoType` | `MOVIE`, `EPISODE`, `SHORT`, `TRAILER`, `TEASER`. `EPISODE` cannot be created yet (422) |
| `Visibility` | `PUBLIC`, `UNLISTED`, `PRIVATE` |
| `PublicationStatus` | `DRAFT`, `PROCESSING`, `READY`, `PUBLISHED`, `UNPUBLISHED`, `FAILED`, `REMOVED` |
| `ProcessingStatus` | `PENDING`, `UPLOADING`, `PROCESSING`, `READY`, `FAILED` |
| `UploadStatus` | `PENDING`, `UPLOADING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED` |
| `JobStatus` | `PENDING`, `PROCESSING`, `READY` (means succeeded), `FAILED` |
| Roles | `USER`, `CREATOR`, `MODERATOR`, `ADMIN` |
| `sort` (GET /videos) | `popular` (default, by view count), `recent` (by published date), `liked` (by like count; likes do not exist yet, so it is always 0) |
| Genres | Action, Adventure, Animation, Comedy, Crime, Documentary, Drama, Fantasy, Horror, Mystery, Romance, Science Fiction, Thriller, Historical, Family. Matched case-insensitively and stored in this spelling |
| Upload formats | `video/mp4` (`.mp4`), `video/quicktime` (`.mov`), `video/webm` (`.webm`). The file extension must match the content type. Max size 2147483648 bytes (2 GiB) |

## Shapes

`Video` is the `Video` type of `domain.ts` plus three additive fields (`seasonNumber`, `episodeNumber`, `version`).

```json
{
  "id": "6b065184-f8e1-43b5-9845-5aecd31962a8",
  "slug": "beyond-the-universe-k3x9a2bq",
  "title": "Beyond the Universe",
  "description": "A lone AI probe...",
  "type": "MOVIE",
  "thumbnailUrl": null,
  "hlsUrl": "https://cdn.example/videos/6b06.../hls/master.m3u8",
  "durationSeconds": 95,
  "genre": "Science Fiction",
  "language": "en",
  "visibility": "PUBLIC",
  "publicationStatus": "PUBLISHED",
  "processingStatus": "READY",
  "isAiGenerated": true,
  "viewCount": 0,
  "likeCount": 0,
  "publishedAt": "2026-11-07T05:31:52.1Z",
  "createdAt": "2026-11-07T05:31:51.6Z",
  "creator": { "id": "…", "username": "neondirector", "displayName": "Neon Director", "avatarUrl": null, "followerCount": 0 },
  "seasonNumber": null,
  "episodeNumber": null,
  "version": 3,
  "trailerVideoId": "0d2f6c1e-5a77-4c0a-8d55-7e0a3a9f1b42",
  "trailer": {
    "id": "0d2f6c1e-5a77-4c0a-8d55-7e0a3a9f1b42",
    "title": "Beyond the Universe: Trailer",
    "hlsUrl": "https://cdn.example/videos/0d2f.../hls/master.m3u8",
    "thumbnailUrl": null,
    "durationSeconds": 45
  }
}
```

Trailer fields (additive): `trailer` is the title's playable trailer or `null`. It is non-null only when the linked
trailer exists, is not deleted, finished processing and has a stream, so `trailer.hlsUrl` is never null. `trailerVideoId` is
`trailer.id` on public reads, and null without a playable trailer. On creator reads (`/creator/videos...`) `trailerVideoId`
is also set while the linked trailer exists but is still uploading or processing (then `trailer` is `null`), so the creator
UI can poll `GET /videos/{trailerVideoId}/processing-status`.

Value rules: `genre` is `""` until set. `durationSeconds` is `0` until processing reports it. `thumbnailUrl` and `hlsUrl` are
`null` until processing has produced them. `publishedAt` is `null` until published. `slug` is what `/watch/{slug}` uses.

`Creator` = `{ id, username, displayName, avatarUrl (nullable), followerCount }`.

`Series` = `{ id, slug, title, description, posterUrl (nullable), genre ("" if unset), seasonCount, episodeCount, creator }`.
Counts include only live seasons and published, public, not deleted episodes.

`AuthUser` = `{ id, email, username, displayName, avatarUrl (nullable), bio, roles: string[], emailVerified: boolean, createdAt }`.
Contains the private `email`: it is only ever returned to the user themself.

`AuthResponse` = `{ accessToken, refreshToken, tokenType: "Bearer", expiresIn: 900, user: AuthUser }`.

`UploadSession`:

```json
{
  "id": "…", "videoId": "…", "status": "PENDING",
  "filename": "movie.mp4", "contentType": "video/mp4", "sizeBytes": 123456, "uploadedBytes": 0,
  "upload": { "url": "https://…signed…", "method": "PUT", "headers": { "Content-Type": "video/mp4" } },
  "expiresAt": "…", "completedAt": null, "failure": null, "createdAt": "…"
}
```

`upload` is non-null only while the session is `PENDING`/`UPLOADING` and not expired (it is re-signed on every `GET`).
`failure` = `{ code, message }` when `status` is `FAILED`.

`ProcessingStatus` response:

```json
{ "videoId": "…", "processingStatus": "PROCESSING", "publicationStatus": "PROCESSING", "jobStatus": "PENDING",
  "progressPercent": 0, "failure": null, "updatedAt": "…" }
```

`jobStatus` is `null` before an upload is confirmed. `failure` = `{ code, message }` after an upload or processing failure.
It explains why (spec 3.7).

## Endpoints

Status codes listed are the success code first, then the errors a client should handle. Every endpoint can also return the
generic `400 VALIDATION_ERROR` / `400 MALFORMED_REQUEST`, `401`, `403` and `500 INTERNAL_ERROR` where they apply.

### Auth (spec 7.1)

| Method and path | Auth | Request body | Success | Errors |
|---|---|---|---|---|
| `POST /auth/register` | none | `{ email, username, displayName, password }` | `201 AuthResponse` (user is logged in) | `400 VALIDATION_ERROR`, `409 DUPLICATE_RESOURCE` (`details` lists `email` and/or `username`) |
| `POST /auth/login` | none | `{ email, password }` | `200 AuthResponse` | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` |
| `POST /auth/refresh` | none | `{ refreshToken }` | `200 AuthResponse` (new pair) | `401 INVALID_REFRESH_TOKEN` / `SESSION_EXPIRED` |
| `POST /auth/logout` | none | optional `{ refreshToken }`, ignored | `204` | none |
| `GET /auth/me` | bearer | none | `200 AuthUser` | `401 UNAUTHENTICATED` |
| `POST /auth/verify-email` | none | `{ token }` | `204` (idempotent) | `400 INVALID_VERIFICATION_TOKEN` |
| `POST /auth/resend-verification` | bearer | none | `202` empty body | `409 EMAIL_ALREADY_VERIFIED` |

Field rules: `email` valid, max 254, stored lowercase. `username` `^[a-z0-9_]{3,30}$` (same as the signup form). `displayName` 1 to 50
chars. `password` 8 to 72 characters and at most 72 bytes in UTF-8. `confirmPassword` is a client-side check only: do not send it.
Email is not verified at registration and does not block anything yet. The verification email is a stub (see below): the link
the real mailer will send is `{AIDRAMA_WEB_BASE_URL}/verify-email?token=<token>`. A page at `/verify-email` should `POST` that token.

### Creator videos (spec 7.3), role `CREATOR`

All of these are scoped to the caller's own videos. Another creator's video id returns `404 NOT_FOUND`, not 403.

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `POST /creator/videos` | `{ type, title, description?, genre?, language?, visibility?, isAiGenerated }` | `201 Video` (`DRAFT`, `PENDING`) | `400 VALIDATION_ERROR` (title blank, `isAiGenerated` missing, unknown `genre`, bad `type`), `422 EPISODE_NOT_SUPPORTED` |
| `GET /creator/videos?page&pageSize&status&q` | `status` = a `PublicationStatus` filter. `q` = case-insensitive substring match on `title` (max 200 chars; trimmed, and blank is treated as absent so `?q=` lists everything). Wildcards are not supported: `%` and `_` match themselves | `200 Paginated<Video>` newest first (by `createdAt`). `pagination.totalItems` counts the matches, so it is the true total across pages | `400 VALIDATION_ERROR` (`q` longer than 200) |
| `GET /creator/videos/{id}` | none | `200 Video` | `404` |
| `PUT /creator/videos/{id}` | `{ title, description?, genre?, language, visibility, isAiGenerated, version }` (full replace, all editable fields) | `200 Video` | `404`, `409 CONCURRENT_MODIFICATION`, `422 VIDEO_REMOVED` / `GENRE_REQUIRED` (a published video must keep a genre) |
| `POST /creator/videos/{id}/publish` | optional `{ genre?, visibility? }` (omitted fields keep the current value) | `200 Video` (`PUBLISHED`, `publishedAt` set). Publishing a published video is a no-op update | `404`, `422 VIDEO_NOT_READY` (still processing, not uploaded, or failed), `422 GENRE_REQUIRED`, `422 VISIBILITY_REQUIRED` (must end up `PUBLIC` or `UNLISTED`), `422 VIDEO_REMOVED`, `400` (unknown genre) |
| `DELETE /creator/videos/{id}` | none | `204 No Content`. Soft delete: the video moves to `REMOVED`, leaves every creator and public listing, and can no longer be edited, published or uploaded to. Stored media is retained for a later purge. Its trailer link is cleared, so the trailer can back another title | `404` (not your video, or already deleted) |
| `POST /creator/videos/{id}/trailer` | `{ trailerVideoId }` (required UUID of one of your `TRAILER` videos) | `200 Video` (the title, with the new `version`). Replaces any current trailer. Linking the current trailer again is a no-op `200` | `400 VALIDATION_ERROR` / `MALFORMED_REQUEST`, `404` (title not yours), `409 TRAILER_ALREADY_LINKED`, `409 TRAILER_DELETED`, `422 TRAILER_NOT_FOUND` (missing, deleted, removed or not yours), `422 NOT_A_TRAILER`, `422 TRAILER_SELF_LINK`, `422 TRAILER_NESTING_NOT_ALLOWED` (the title is itself a `TRAILER`), `422 VIDEO_REMOVED` |
| `DELETE /creator/videos/{id}/trailer` | none | `200 Video` (the title, with the new `version`). Clears the link; the trailer video is kept. Idempotent: a title without a trailer returns `200` unchanged | `404` (title not yours) |

Defaults: `language` `en` (BCP 47 tag, max 35), `visibility` `PRIVATE`, `description` `""`. `title` max 200, `description` max 5000.
Thumbnails are produced by processing; there is no thumbnail upload yet.

### Inline trailer (role `CREATOR`)

A title (`MOVIE`, `SHORT`, ...) can have one trailer for its "Watch trailer" button. The trailer is a real video of type
`TRAILER` of the same creator, created and uploaded with the same endpoints as any video. There is no separate pipeline.

1. `POST /creator/videos` with `type: "TRAILER"` creates the trailer draft (same body as any video; `genre` is optional).
2. `POST /uploads/initiate` with `videoId` = the trailer id, then the browser `PUT`, then `POST /uploads/{id}/complete`.
   The trailer has its own upload session and processing job, and uploads in parallel with the title.
3. `POST /creator/videos/{titleId}/trailer` with `{ "trailerVideoId": "<trailer id>" }` links it. This may happen right after step 1:
   linking does not wait for processing.
4. Viewers get the trailer in `GET /videos/{slug}` as `trailer` once it is playable (see the `Video` shape). Until then `trailer` is `null`.

The title publishes on its own readiness (`POST /creator/videos/{titleId}/publish`). A trailer that is still processing, failed
or missing never blocks it. The trailer does not need to be published itself: it is exposed through its title, so it follows
the title's visibility. A trailer that is soft-deleted after being linked simply reads as no trailer. One trailer backs at most
one title (`409 TRAILER_ALREADY_LINKED`). Trailers appear in `GET /creator/videos` like any other video (filter on `type` client-side).

Database rules are mapped to the same codes if they ever fire after the checks above (a race): `409 TRAILER_ALREADY_LINKED`,
`409 TRAILER_DELETED`, `422 TRAILER_NOT_FOUND`, `422 NOT_A_TRAILER`, `422 TRAILER_SELF_LINK`, `422 TRAILER_NESTING_NOT_ALLOWED`.
The client never receives SQL or constraint names.

### Uploads (spec 5.3, 7.5), role `CREATOR`

Flow: `POST /creator/videos` → `POST /uploads/initiate` → browser `PUT` to `upload.url` → `POST /uploads/{id}/complete` →
poll `GET /videos/{id}/processing-status` until `processingStatus` is `READY` or `FAILED` → `POST /creator/videos/{id}/publish`.

| Method and path | Request | Success | Errors |
|---|---|---|---|
| `POST /uploads/initiate` | header `Idempotency-Key` (optional); body `{ videoId, filename, contentType, sizeBytes }` | `201 UploadSession`. `200` with the same session when the key was already used with an identical body | `400 UNSUPPORTED_VIDEO_FORMAT`, `400 VALIDATION_ERROR`, `404` (not your video), `409 UPLOAD_IN_PROGRESS` (`details[0]` = `{ field: "uploadId", issue: "<id>" }`), `409 VIDEO_ALREADY_UPLOADED`, `409 IDEMPOTENCY_KEY_REUSED`, `413 UPLOAD_TOO_LARGE`, `422 VIDEO_REMOVED` |
| `GET /uploads/{id}` | none | `200 UploadSession` | `404` |
| `POST /uploads/{id}/complete` | none (no body) | `200 { upload: UploadSession, processing: ProcessingStatus }`. Retrying a completed session returns the same result | `404`, `409 UPLOAD_SESSION_EXPIRED` / `UPLOAD_SESSION_NOT_ACTIVE`, `422 UPLOAD_OBJECT_MISSING` (file not in storage yet: finish the PUT and retry), `422 UPLOAD_VERIFICATION_FAILED` (size or type differs from what was declared: start a new upload), `502 STORAGE_UNAVAILABLE` (retry) |
| `POST /uploads/{id}/cancel` | none | `200 UploadSession` (`CANCELLED`). Cancelling a cancelled session is OK | `404`, `409 UPLOAD_ALREADY_COMPLETED` |
| `GET /videos/{id}/processing-status` | none | `200 ProcessingStatus` | `401`, `404` (not your video) |

Browser upload to `upload.url`: send `PUT` with exactly the `upload.headers` (`Content-Type`) and the raw `File` as the body.
Do NOT add an `Authorization` header or any custom header (the URL is already signed; extra headers can break the signature).
The size is signed, so the body must be exactly `sizeBytes` bytes. The URL expires at `expiresAt` (60 minutes by default). The
storage bucket needs a CORS rule allowing `PUT` from the web origin with header `Content-Type`.
`sizeBytes` is sent as a number (JSON integer). A new upload is allowed after a `FAILED`, `CANCELLED` or `EXPIRED` session,
or while the video is `PENDING`/`FAILED`. After a successful `complete` the video cannot be uploaded again.
A session stays usable for 10 minutes past `expiresAt` so a slow upload that started in time can still be confirmed.

### Public discovery and watch (spec 7.2), no login

Only videos that are `PUBLISHED`, `PUBLIC` and not deleted are listed, and when a video belongs to a series that series
must also be `PUBLISHED`, `PUBLIC` and not deleted.

| Method and path | Query | Success | Errors |
|---|---|---|---|
| `GET /home` | none | `200 HomeFeed` | none |
| `GET /videos` | `type` (VideoType), `genre`, `sort` (`popular` default, `recent`, `liked`), `page`, `pageSize` | `200 Paginated<Video>` | `400` for bad `type`, `sort`, `page`, `pageSize`. An unknown `genre` gives an empty list |
| `GET /videos/{slug}` | none | `200 Video` | `404` |
| `GET /series` | `genre`, `page`, `pageSize` | `200 Paginated<Series>`, newest first | `400` |
| `GET /series/{slug}` | none | `200 { series: Series, episodes: Video[] }`, episodes ordered by season then episode number, max 500 | `404` |

`GET /videos/{slug}`: anyone can open a `PUBLISHED` video that is `PUBLIC` or `UNLISTED` (share links). If it belongs to a series,
that series must be `PUBLISHED` and not `PRIVATE`. A `PRIVATE`, draft, unpublished or deleted video returns `404` to everyone except
its owner (send the bearer token). Unlisted videos are never in lists.

`HomeFeed` = `{ featured: FeaturedTitle | null, stats: PlatformStat[], trending: Video[], originals: Video[] }`:

- `featured` is the newest published video. It is `null` while the catalog is empty. `FeaturedTitle` = `{ video, backdropUrl, kicker, tagline }`.
  `backdropUrl` is the video thumbnail, or `""` if it has none (there is no separate backdrop image yet). `kicker` is `"Featured <genre>"`.
  `tagline` is the first sentence of the description (max 140 chars), or the title.
- `stats` is always three items: `{ value, label }` for `Videos`, `Creators`, `Views` with `value` already compact (`"1.2K"`).
- `trending` is the 8 most viewed, `originals` is the 8 most recently published. Both exclude the featured video, so a catalog with
  fewer than 9 videos shows short or empty rails.

### View counting, no login

`POST /videos/{slug}/view-events` reports playback so the server can count views. `{slug}` is the same slug as `GET /videos/{slug}`.
Anonymous and signed-in callers are both accepted. Request body (JSON, camelCase like the rest of the API):

| Field | Type | Rules |
|---|---|---|
| `eventType` | `"PLAY_START"` \| `"VIEW_QUALIFIED"` \| `"PLAY_COMPLETE"` | required |
| `watchedSeconds` | integer | required, 0 to 86400. Seconds of the video watched so far |
| `sessionId` | string | required when not signed in, ignored when signed in. 16 to 64 chars of `A-Za-z0-9_-`. A random id the client creates once per browser (for example `crypto.randomUUID()` kept in localStorage) |

Response `200 { "recorded": boolean, "counted": boolean }`. `counted: true` means this call raised the video's `viewCount` by 1.
Errors: `400 VALIDATION_ERROR` (field named in `details`, for example `sessionId`), `400 MALFORMED_REQUEST` (unknown `eventType`, bad JSON),
`401 UNAUTHENTICATED` (only if a bearer token is sent and it is invalid or expired), `404 NOT_FOUND` (unknown video, or one that is not
`PUBLISHED` and `PUBLIC`/`UNLISTED`; the owner's drafts and private videos also return 404 so they cannot be counted).

Counting rule: `viewCount` goes up by 1 only for a `VIEW_QUALIFIED` event with `watchedSeconds >= 10` (server setting
`aidrama.views.qualified-seconds`). `PLAY_START` and `PLAY_COMPLETE` are stored but never count. A `VIEW_QUALIFIED` below 10 seconds returns
`{ recorded: false, counted: false }` and is not stored. De-duplication is server-side: one event of each type per viewer, video and UTC
calendar day. A repeat returns `{ recorded: false, counted: false }`. A signed-in viewer is identified by the token, an anonymous one by
`sessionId`; the server stores only a salted hash of either, never the raw id or an IP address. The updated count is not returned: read it
from `GET /videos/{slug}`.

### Not part of this slice (do not call)

Global catalogue search, `/genres`, `/videos/trending|recent|popular|recommended`, unpublish, series and season management, creator dashboard
and analytics, likes, comments, follows, history, watchlist, notifications, admin, forgot/reset password. These stay on mock data.
`likeCount` (stays 0) is not implemented either.

## Error codes

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `MALFORMED_REQUEST`, `UNSUPPORTED_VIDEO_FORMAT`, `INVALID_VERIFICATION_TOKEN` |
| 401 | `UNAUTHENTICATED` (missing, invalid or expired access token), `INVALID_CREDENTIALS`, `INVALID_REFRESH_TOKEN`, `SESSION_EXPIRED` |
| 403 | `FORBIDDEN` (lacks `CREATOR`), `ACCOUNT_SUSPENDED`, `ACCOUNT_DEACTIVATED` |
| 404 | `NOT_FOUND` (missing, hidden, or not yours) |
| 405 / 406 / 415 | `METHOD_NOT_ALLOWED`, `NOT_ACCEPTABLE`, `UNSUPPORTED_MEDIA_TYPE` (wrong request `Content-Type`) |
| 409 | `DUPLICATE_RESOURCE`, `CONFLICT`, `REFERENCE_CONFLICT`, `CONCURRENT_MODIFICATION`, `EMAIL_ALREADY_VERIFIED`, `UPLOAD_IN_PROGRESS`, `VIDEO_ALREADY_UPLOADED`, `IDEMPOTENCY_KEY_REUSED`, `UPLOAD_SESSION_NOT_ACTIVE`, `UPLOAD_SESSION_EXPIRED`, `UPLOAD_ALREADY_COMPLETED`, `PROCESSING_ALREADY_QUEUED` |
| 413 | `UPLOAD_TOO_LARGE` |
| 422 | `VIDEO_NOT_READY`, `GENRE_REQUIRED`, `VISIBILITY_REQUIRED`, `VIDEO_REMOVED`, `EPISODE_NOT_SUPPORTED`, `UPLOAD_OBJECT_MISSING`, `UPLOAD_VERIFICATION_FAILED`, `CONSTRAINT_VIOLATION` |
| 500 / 502 | `INTERNAL_ERROR`, `STORAGE_UNAVAILABLE` |

Database mapping: SQLSTATE `23505` becomes `409` (`DUPLICATE_RESOURCE` for email or username, otherwise `CONFLICT`), `23503` becomes
`409 REFERENCE_CONFLICT`, `23514` becomes `422 CONSTRAINT_VIOLATION`. `429` is reserved: rate limiting is not implemented yet.

## Changes the frontend needs (types and client)

1. `HomeFeed.featured` must be `FeaturedTitle | null` (empty catalog).
2. `GET /series` returns the pagination envelope. `api.listSeries()` should unwrap `.data` (or return `Paginated<Series>`).
3. `Video` gains optional `seasonNumber: number | null`, `episodeNumber: number | null`, `version: number`. Existing code is unaffected.
4. New types are needed for `AuthUser`, `AuthResponse`, `UploadSession`, `ProcessingStatus` (response), request bodies and the error envelope.
5. Auth forms: login sends `{ email, password }`; register sends `{ displayName, username, email, password }` (drop `confirmPassword`).
6. Treat `genre === ""`, `durationSeconds === 0`, `thumbnailUrl === null` and `hlsUrl === null` as "not available yet".
7. `getVideoBySlug` returns a `404` error envelope, not `null`: map `404` to `null` in the client.
