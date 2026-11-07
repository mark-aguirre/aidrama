# AI Drama: MVP thin-slice database schema

Scope: signup, upload, process, watch. Ten tables only. Everything else in spec section 6.1 (likes, comments,
follows, watch history, playlists, notifications, reports, moderation, subtitles, genres, tags, analytics
aggregates) is out of scope and has no table yet.

| Item | Value |
|---|---|
| Engine | PostgreSQL 15 or newer. Tested on 16.15 (`postgres:16-alpine`). Guarded by a version precondition in 0001. |
| Migration tool | Liquibase, formatted-SQL changesets. Tested with `liquibase/liquibase:4.33.0` (Apache-2.0 line). |
| Why Liquibase | Flyway Community has no undo. Liquibase gives every changeset an explicit `--rollback`. |
| Master changelog | `db/changelog/db.changelog-master.yaml` |
| Tenancy model | Not multi-tenant. One shared catalog. The ownership boundary is `creator_id`, enforced with composite foreign keys (see Integrity rules). |
| Keys | `uuid`, default `gen_random_uuid()` (v4, non-sequential). The backend may supply its own ids. |
| Time | Every timestamp is `timestamptz`, stored as UTC instants. Run the app with `hibernate.jdbc.time_zone=UTC` and JDBC `options=-c timezone=UTC`. |
| Enums | `varchar` plus named `CHECK` constraints, not native PG enum types. New values are a cheap constraint swap and map cleanly in JPA. |
| Soft delete | `deleted_at` on `users`, `drama_series`, `drama_seasons`, `videos`. Queries must filter `deleted_at IS NULL`. |
| Optimistic locking | `version bigint` on mutable aggregates. Map to JPA `@Version`. The database does not increment it. |
| `updated_at` | Maintained by trigger `set_updated_at()` on every table that has the column. |

## Migration files

All under `C:\code_area\Playground\sd\db\changelog\changes\`.

| Order | File | Creates | Down (rollback) |
|---|---|---|---|
| 1 | `0001-helpers.sql` | Function `set_updated_at()`. Halts if PostgreSQL < 15. | drops the function |
| 2 | `0002-users.sql` | `users`, `user_profiles`, `user_roles` | drops the three tables |
| 3 | `0003-series-seasons.sql` | `drama_series`, `drama_seasons` | drops both tables |
| 4 | `0004-videos.sql` | `videos` | drops `videos` |
| 5 | `0005-video-assets.sql` | `video_assets`, FK `fk_videos_thumbnail_asset`, index `ix_videos_thumbnail_asset` | drops index, FK, table |
| 6 | `0006-upload-sessions.sql` | `upload_sessions` | drops the table |
| 7 | `0007-processing-jobs.sql` | `processing_jobs` | drops the table |
| 8 | `0008-video-view-events.sql` | `video_view_events` | drops the table |
| 9 | `0009-soft-delete-guards.sql` | 3 guard functions and 3 triggers | drops triggers, then functions |

Each file holds one changeset (`--changeset aidrama:<file-name-without-extension>`), which runs in one transaction.
Rollback is a `DROP` of objects the same changeset created, so a down migration after real data exists **destroys that
data**. Treat down as a local and test tool. For any shared environment, recovery is restore-from-backup (see Deployment).

## Tables

Legend: PK primary key, FK foreign key, NN NOT NULL, UQ unique. `now()` defaults are UTC instants.

### users (0002)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_users` |
| email | varchar(254) | NN | | UQ `uq_users_email`. Stored lowercase, `ck_users_email_format` |
| username | varchar(30) | NN | | UQ `uq_users_username`. `^[a-z0-9_]{3,30}$`, `ck_users_username_format` |
| password_hash | varchar(255) | NN | | Hash only (Argon2 or bcrypt) |
| email_verified_at | timestamptz | null | | null means unverified |
| account_status | varchar(20) | NN | 'ACTIVE' | `ACTIVE`, `DEACTIVATED`, `SUSPENDED` |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |
| deleted_at | timestamptz | null | | soft delete |

Indexes: only the two unique indexes above. Uniqueness includes soft-deleted rows, so a deleted username or email cannot be reused.

### user_profiles (0002)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| user_id | uuid | NN | | PK `pk_user_profiles`, FK `fk_user_profiles_user` to users(id) ON DELETE CASCADE. One row per user. |
| display_name | varchar(50) | NN | | trimmed, non-empty |
| bio | varchar(500) | NN | '' | |
| avatar_url | varchar(2048) | null | | |
| follower_count | bigint | NN | 0 | `>= 0`. Reserved for the follow module. Stays 0 until it ships. |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |

### user_roles (0002)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_user_roles` |
| user_id | uuid | NN | | FK `fk_user_roles_user` to users(id) ON DELETE CASCADE |
| role | varchar(20) | NN | | `USER`, `CREATOR`, `MODERATOR`, `ADMIN` |
| granted_by | uuid | null | | FK `fk_user_roles_granted_by` to users(id) ON DELETE SET NULL |
| granted_at | timestamptz | NN | now() | |

UQ `uq_user_roles_user_role (user_id, role)`. This also serves "roles of a user".

### drama_series (0003)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_drama_series` |
| creator_id | uuid | NN | | FK `fk_drama_series_creator` to users(id) ON DELETE RESTRICT |
| title | varchar(200) | NN | | trimmed, non-empty |
| slug | varchar(120) | NN | | UQ `uq_drama_series_slug`. `^[a-z0-9]+(-[a-z0-9]+)*$`. Namespace `/series/{slug}` |
| description | varchar(5000) | NN | '' | |
| poster_url | varchar(2048) | null | | Deviation from spec 6.4 `poster_asset_id`: `video_assets` is video-bound, so the poster is a URL |
| genre | varchar(40) | null | | Display value, for example `Science Fiction`. Required when PUBLISHED |
| language | varchar(35) | NN | 'en' | BCP 47 tag |
| visibility | varchar(20) | NN | 'PRIVATE' | `PUBLIC`, `UNLISTED`, `PRIVATE` |
| publication_status | varchar(20) | NN | 'DRAFT' | `DRAFT`, `PUBLISHED`, `UNPUBLISHED`, `REMOVED` (a subset: series are not processed) |
| published_at | timestamptz | null | | Added beyond spec 6.4 for recency ordering. Required when PUBLISHED |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |
| deleted_at | timestamptz | null | | |

Other constraints: UQ `uq_drama_series_id_creator (id, creator_id)` (target for the ownership FK from `videos`),
`ck_drama_series_published_has_timestamp`, `ck_drama_series_published_has_genre`.

Indexes:
- `ix_drama_series_creator_recent (creator_id, created_at DESC, id DESC) WHERE deleted_at IS NULL` creator dashboard.
- `ix_drama_series_public_recent (published_at DESC, id DESC) WHERE publication_status='PUBLISHED' AND visibility='PUBLIC' AND deleted_at IS NULL` public listing.
- `ix_drama_series_public_genre (genre, published_at DESC, id DESC)` same predicate. Listing by genre.

### drama_seasons (0003)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_drama_seasons` |
| series_id | uuid | NN | | FK `fk_drama_seasons_series` to drama_series(id) ON DELETE RESTRICT |
| season_number | integer | NN | | `> 0` |
| title | varchar(200) | null | | |
| description | varchar(5000) | NN | '' | |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |
| deleted_at | timestamptz | null | | |

Other constraints: UQ `uq_drama_seasons_id_series (id, series_id)` (target for the season FK from `videos`).
Index: UQ `uq_drama_seasons_series_number_live (series_id, season_number) WHERE deleted_at IS NULL`. Also serves "seasons of a series".

### videos (0004, FK and index added in 0005)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_videos` |
| creator_id | uuid | NN | | FK `fk_videos_creator` to users(id) ON DELETE RESTRICT |
| series_id | uuid | null | | See composite FK `fk_videos_series` |
| season_id | uuid | null | | See composite FK `fk_videos_season` |
| episode_number | integer | null | | `> 0`. Required for EPISODE, null otherwise |
| video_type | varchar(10) | NN | | `MOVIE`, `EPISODE`, `SHORT`, `TRAILER`, `TEASER` |
| title | varchar(200) | NN | | trimmed, non-empty |
| slug | varchar(120) | NN | | UQ `uq_videos_slug`. Namespace `/watch/{slug}`. Includes soft-deleted rows, so slugs are never recycled |
| description | varchar(5000) | NN | '' | |
| thumbnail_asset_id | uuid | null | | Composite FK `fk_videos_thumbnail_asset (thumbnail_asset_id, id)` to video_assets(id, video_id) ON DELETE SET NULL (thumbnail_asset_id) |
| duration_seconds | integer | null | | `>= 0`. Null until processing extracts it |
| genre | varchar(40) | null | | Display value. Required when PUBLISHED |
| language | varchar(35) | NN | 'en' | |
| visibility | varchar(20) | NN | 'PRIVATE' | `PUBLIC`, `UNLISTED`, `PRIVATE` |
| publication_status | varchar(20) | NN | 'DRAFT' | `DRAFT`, `PROCESSING`, `READY`, `PUBLISHED`, `UNPUBLISHED`, `FAILED`, `REMOVED` |
| processing_status | varchar(20) | NN | 'PENDING' | `PENDING`, `UPLOADING`, `PROCESSING`, `READY`, `FAILED`. Written only by the upload and processing pipeline |
| content_rating | varchar(20) | null | | Values not yet defined by the spec. No CHECK |
| is_ai_generated | boolean | NN | none | No default on purpose. The creator must declare it |
| allow_comments | boolean | NN | true | |
| view_count | bigint | NN | 0 | `>= 0`. Derived from `video_view_events` |
| like_count | bigint | NN | 0 | `>= 0`. Reserved for the likes module. Stays 0 until it ships |
| published_at | timestamptz | null | | Required when PUBLISHED |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |
| deleted_at | timestamptz | null | | |

Foreign keys beyond the simple ones:
- `fk_videos_series (series_id, creator_id)` to `drama_series (id, creator_id)` RESTRICT. A video can only join its own creator's series.
- `fk_videos_season (season_id, series_id)` to `drama_seasons (id, series_id)` RESTRICT. A season must belong to the video's series.
- UQ `uq_videos_id_creator (id, creator_id)` is the target for `upload_sessions` ownership.

Check constraints (all named `ck_videos_*`):
- `video_type`, `visibility`, `publication_status`, `processing_status` enums.
- `slug_format`, `title`, `genre` (trimmed), `duration` (`>= 0`), `counters` (`>= 0`).
- `episode_shape`: EPISODE requires series_id, season_id and episode_number. Every other type requires season_id and episode_number to be null. (series_id is optional for TRAILER, TEASER.)
- `ready_requires_processed`: publication_status READY or PUBLISHED requires `processing_status = 'READY'`.
- `published_has_timestamp`, `published_has_genre`: PUBLISHED requires `published_at` and `genre`.

Indexes (P = `publication_status='PUBLISHED' AND visibility='PUBLIC' AND deleted_at IS NULL`):

| Index | Definition | Serves |
|---|---|---|
| uq_videos_season_episode_live | UNIQUE (season_id, episode_number) WHERE season_id IS NOT NULL AND deleted_at IS NULL | Episode number unique per season. Episodes of a season |
| ix_videos_public_recent | (published_at DESC, id DESC) WHERE P | Home and explore, newest first, keyset paging |
| ix_videos_public_type_recent | (video_type, published_at DESC, id DESC) WHERE P | Browse by type |
| ix_videos_public_genre_recent | (genre, published_at DESC, id DESC) WHERE P | Browse by genre |
| ix_videos_public_trending | (view_count DESC, id DESC) WHERE P | Trending rail |
| ix_videos_creator_recent | (creator_id, created_at DESC, id DESC) WHERE deleted_at IS NULL | Creator dashboard list and per-status counts |
| ix_videos_series | (series_id) WHERE series_id IS NOT NULL | Series page, trailers, delete guard |
| ix_videos_thumbnail_asset (0005) | (thumbnail_asset_id) WHERE thumbnail_asset_id IS NOT NULL | FK check when an asset is deleted |
| uq_videos_slug | UNIQUE (slug) | Watch page lookup |

### video_assets (0005)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_video_assets` |
| video_id | uuid | NN | | FK `fk_video_assets_video` to videos(id) ON DELETE RESTRICT |
| asset_type | varchar(20) | NN | | `ORIGINAL`, `HLS_MASTER`, `HLS_RENDITION`, `THUMBNAIL` |
| processing_status | varchar(20) | NN | 'PENDING' | `PENDING`, `UPLOADING`, `PROCESSING`, `READY`, `FAILED` |
| storage_bucket | varchar(63) | NN | | |
| storage_key | varchar(1024) | NN | | Public URLs are built by the backend from bucket and key |
| mime_type | varchar(100) | null | | |
| size_bytes | bigint | null | | `>= 0` |
| width_px, height_px, bitrate_kbps | integer | null | | each `> 0` when set |
| rendition_label | varchar(20) | null | | for example `720p` |
| checksum_sha256 | char(64) | null | | lowercase hex |
| created_at, updated_at | timestamptz | NN | now() | |

Unique: `uq_video_assets_id_video (id, video_id)` (FK target), `uq_video_assets_storage_object (storage_bucket, storage_key)`,
`uq_video_assets_one_original (video_id) WHERE asset_type='ORIGINAL'`, `uq_video_assets_one_hls_master (video_id) WHERE asset_type='HLS_MASTER'`.
Index: `ix_video_assets_video_type (video_id, asset_type)`.

### upload_sessions (0006)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_upload_sessions` |
| creator_id | uuid | NN | | Part of FK `fk_upload_sessions_video_owner (video_id, creator_id)` to videos(id, creator_id) RESTRICT |
| video_id | uuid | NN | | See above |
| status | varchar(20) | NN | 'PENDING' | `PENDING`, `UPLOADING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED` |
| original_filename | varchar(255) | NN | | |
| content_type | varchar(100) | NN | | Allowed formats (MP4, MOV, WebM) are validated by the backend |
| declared_size_bytes | bigint | NN | | `> 0` |
| uploaded_bytes | bigint | NN | 0 | `0 <= uploaded_bytes <= declared_size_bytes` |
| storage_bucket | varchar(63) | NN | | UQ `uq_upload_sessions_storage_object (storage_bucket, storage_key)` |
| storage_key | varchar(1024) | NN | | |
| multipart_upload_id | varchar(1024) | null | | S3 multipart upload id |
| part_size_bytes | bigint | null | | |
| total_parts | integer | null | | `> 0` when set |
| completed_parts | integer | NN | 0 | `<= total_parts` when set |
| idempotency_key | varchar(64) | null | | |
| failure_code | varchar(50) | null | | Required with failure_message when FAILED |
| failure_message | varchar(1000) | null | | Shown to the creator |
| expires_at | timestamptz | NN | | |
| completed_at | timestamptz | null | | Required when COMPLETED |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |

Indexes: `ix_upload_sessions_creator_recent (creator_id, created_at DESC, id DESC)` upload history;
`ix_upload_sessions_video_recent (video_id, created_at DESC)`;
UQ `uq_upload_sessions_one_active_per_video (video_id) WHERE status IN ('PENDING','UPLOADING')`;
UQ `uq_upload_sessions_idempotency (creator_id, idempotency_key) WHERE idempotency_key IS NOT NULL`;
`ix_upload_sessions_expiry (expires_at) WHERE status IN ('PENDING','UPLOADING')`.

### processing_jobs (0007)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_processing_jobs` |
| video_id | uuid | NN | | FK `fk_processing_jobs_video` to videos(id) RESTRICT |
| source_asset_id | uuid | NN | | Composite FK `fk_processing_jobs_source_asset (source_asset_id, video_id)` to video_assets(id, video_id) RESTRICT |
| status | varchar(20) | NN | 'PENDING' | `PENDING`, `PROCESSING`, `READY` (succeeded), `FAILED` |
| progress_percent | smallint | NN | 0 | 0 to 100 |
| attempt_count | integer | NN | 0 | `>= 0` |
| max_attempts | integer | NN | 3 | `> 0` |
| run_after | timestamptz | NN | now() | Earliest start. Use for retry backoff |
| worker_id | varchar(100) | null | | |
| started_at | timestamptz | null | | Required when PROCESSING |
| heartbeat_at | timestamptz | null | | |
| finished_at | timestamptz | null | | Required when READY or FAILED |
| failure_code | varchar(50) | null | | Required with failure_message when FAILED |
| failure_message | varchar(1000) | null | | |
| version | bigint | NN | 0 | |
| created_at, updated_at | timestamptz | NN | now() | |

Indexes: `ix_processing_jobs_video_recent (video_id, created_at DESC)`;
UQ `uq_processing_jobs_one_active_per_video (video_id) WHERE status IN ('PENDING','PROCESSING')`;
`ix_processing_jobs_runnable (run_after, id) WHERE status='PENDING'`;
`ix_processing_jobs_stalled (heartbeat_at) WHERE status='PROCESSING'`.

### video_view_events (0008)

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| id | uuid | NN | gen_random_uuid() | PK `pk_video_view_events` |
| video_id | uuid | NN | | FK `fk_video_view_events_video` to videos(id) RESTRICT |
| viewer_user_id | uuid | null | | FK `fk_video_view_events_viewer` to users(id) ON DELETE SET NULL. Null for anonymous |
| viewer_key | varchar(64) | NN | | Salted hash of an anonymous or session id. Never a raw IP |
| event_type | varchar(20) | NN | | `PLAY_START`, `VIEW_QUALIFIED`, `PLAY_COMPLETE` |
| watched_seconds | integer | NN | 0 | `>= 0` |
| dedupe_key | varchar(64) | null | | Backend-computed. Makes counting idempotent |
| occurred_at | timestamptz | NN | now() | |

Append-only. No `deleted_at`, `updated_at`, or `version`.
Indexes: `ix_video_view_events_video_time (video_id, occurred_at DESC)`;
UQ `uq_video_view_events_dedupe (video_id, dedupe_key) WHERE dedupe_key IS NOT NULL`;
`ix_video_view_events_occurred_brin USING brin (occurred_at)` retention purge.

## Integrity rules enforced in the database

| Rule | Mechanism |
|---|---|
| Unique username and email | `uq_users_username`, `uq_users_email` |
| Slug unique per routing namespace | `uq_videos_slug` (`/watch`), `uq_drama_series_slug` (`/series`). The same text may exist in both |
| Episode number unique per season | `uq_videos_season_episode_live` |
| Season number unique per series | `uq_drama_seasons_series_number_live` |
| visibility and publication_status are independent | Two columns, two enum CHECKs, no cross-check between them |
| Cannot be READY or PUBLISHED before processing finishes | `ck_videos_ready_requires_processed` |
| A video cannot reference another creator's series | `fk_videos_series` |
| A season must belong to the video's series | `fk_videos_season` plus `ck_videos_episode_shape` |
| Upload session owner must own the video | `fk_upload_sessions_video_owner` |
| Job source asset must belong to the job's video | `fk_processing_jobs_source_asset` |
| Thumbnail must be one of the video's own assets | `fk_videos_thumbnail_asset` |
| One in-flight upload and one active job per video | Partial unique indexes |
| Deleting a series does not orphan episodes | RESTRICT on all hard-delete FKs, plus the 0009 triggers for soft delete (SQLSTATE 23503, map to HTTP 409) |

Not enforceable by a single-table constraint, so the backend must apply them:
1. Episodes inherit parent access (spec 3.6). Discovery queries over `videos` must also require the parent series to be
   PUBLISHED, PUBLIC and not deleted. Canonical predicate:
   `AND (v.series_id IS NULL OR EXISTS (SELECT 1 FROM drama_series s WHERE s.id = v.series_id AND s.publication_status='PUBLISHED' AND s.visibility='PUBLIC' AND s.deleted_at IS NULL))`.
2. Unlisted and private access: the watch endpoint must check `visibility` and ownership. The database does not use row-level security in the MVP.
3. `thumbnail_asset_id` should point to an asset of type THUMBNAIL.
4. Soft delete order is episodes, then seasons, then the series, in one short transaction.
5. `view_count` is incremented only when the `ON CONFLICT (video_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING` insert actually added a row.

## Frontend mapping (`frontend/src/types/domain.ts`)

| Frontend field | Source |
|---|---|
| Video.id, slug, title, description, genre, language, visibility | `videos.<same name>` |
| Video.type | `videos.video_type` |
| Video.publicationStatus, processingStatus | `videos.publication_status`, `videos.processing_status` |
| Video.durationSeconds | `videos.duration_seconds` (null before processing, so return 0 or null deliberately) |
| Video.isAiGenerated, viewCount, likeCount, publishedAt, createdAt | `is_ai_generated`, `view_count`, `like_count`, `published_at`, `created_at` |
| Video.thumbnailUrl | URL from the asset `videos.thumbnail_asset_id` |
| Video.hlsUrl | URL from the `HLS_MASTER` asset of the video |
| Creator.id, username | `users.id`, `users.username` |
| Creator.displayName, avatarUrl, followerCount | `user_profiles.display_name`, `avatar_url`, `follower_count` |
| Series.posterUrl | `drama_series.poster_url` |
| Series.seasonCount, episodeCount | Computed: live seasons and live EPISODE videos of the series |
| CreatorStats | Computed from `videos` of the creator (`SUM(view_count)`, counts by `publication_status`), `follower_count` |

## Verification

`db/verify/verify.ps1` starts a disposable `postgres:16-alpine` container on a private docker network (no published ports),
then runs Liquibase against it. It takes no connection string, so it cannot reach a shared or production database.

```
powershell -NoProfile -ExecutionPolicy Bypass -File C:\code_area\Playground\sd\db\verify\verify.ps1 -Explain
```

Steps: `update-sql` (reviewable SQL written to `db/verify/out/update.sql`), `update`, schema dump, `rollback-count 9`
(asserts zero tables, functions, triggers and enums left), `update` again, dump again and compare (identical),
a second `update` (no-op), 50 constraint tests, and with `-Explain` a synthetic data volume run.

Result of the last run: 9 changesets applied, rolled back to an empty database, re-applied to an identical schema, 50 of 50 constraint tests passed.

Plan review on synthetic data (320,000 videos of which 144,676 public and published, 100,050 jobs, 1,000,000 view events). Numbers are from one run in a cold container, so read them as relative, not as benchmarks:

| Query | Plan | Execution |
|---|---|---|
| Recency, first page and deep keyset page | `ix_videos_public_recent`, 24 rows, no sort | 0.04 ms, 0.26 ms |
| By genre | `ix_videos_public_genre_recent` | 0.87 ms |
| Trending | `ix_videos_public_trending` | 1.6 ms |
| Discovery with parent-series check | `ix_videos_public_recent` plus hashed series subplan (2,000 series) | 0.8 ms |
| Creator dashboard list, per-status counts | `ix_videos_creator_recent` | 2.8 ms, 0.2 ms |
| Episodes of a season | `uq_videos_season_episode_live` | 0.14 ms |
| Watch page by slug | `uq_videos_slug` | 0.8 ms |
| Worker poll with `FOR UPDATE SKIP LOCKED` | `ix_processing_jobs_runnable` | 0.05 ms |
| Views of one video, 7 days | `ix_video_view_events_video_time`, index only | 0.1 ms |
| Retention purge batch (10,000 rows older than 85 days, time-ordered inserts) | BRIN `ix_video_view_events_occurred_brin` | 1.7 ms |

Findings:
- **By type:** at 25% selectivity the planner ignores `ix_videos_public_type_recent` and filters on `ix_videos_public_recent`. With a rare type (about 1% of rows) the type index reads about 107 buffers versus about 1,780 without it, with similar wall time on a warm cache. The index is kept for skewed catalogs. Check `pg_stat_user_indexes.idx_scan` after launch and drop it if it stays at zero.
- **Parent-series check:** the hashed subplan builds all published series per query. That is fine at 2,000 series. Re-check the plan if series count reaches the tens of thousands.
- **BRIN purge index:** only effective while `occurred_at` follows insert order, which holds for an append-only log. A first test with randomly ordered times did not use it, so the index depends on that property.
- **Index cost:** the largest indexes are `ix_video_view_events_video_time` (50 MB per 1M events) and `uq_videos_id_creator` (20 MB per 320k videos, needed only as the ownership FK target). Accepted for the integrity they buy.

## Deployment, backup, recovery

1. This is greenfield. No production or shared database exists, and nothing here has been run against one.
2. Before applying anywhere shared, run `liquibase update-sql` and have the SQL reviewed (the verify script writes the same output).
3. Apply order is the file order in the master changelog. Deploy the migration before the backend that needs it.
4. Take a verified backup (`pg_dump` or snapshot, plus a test restore into a scratch database) before any change after real data exists. No restore has been tested yet because no backup exists yet.
5. Recovery: do not use `liquibase rollback` on a database holding real data, since rollbacks drop tables. Restore from the verified backup. A corrective change is a new numbered file, never an edit to an applied one.
6. Future changes follow expand and contract: add nullable or defaulted schema, deploy compatible code, backfill in batches, switch, remove in a later release.
7. Use synthetic data in dev and test. Never copy production data into them.

## Open items for other owners

- Not in the ten tables: email verification and password reset tokens, refresh tokens or sessions, genres, search (a trigram or full-text index will be needed for the "Search" must-have), subtitles.
- `content_rating` values are undefined in the spec.
- Account deletion must anonymize `users` and `user_profiles` (email and username are unique across deleted rows). Define that process before launch.
- `video_view_events` may need monthly range partitioning at scale. That requires a new table plus backfill, since the partition key must be in the primary key.
