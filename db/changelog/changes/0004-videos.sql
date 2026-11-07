--liquibase formatted sql

--changeset aidrama:0004-videos dbms:postgresql
-- One table for MOVIE, EPISODE, SHORT, TRAILER and TEASER. Routing namespace is /watch/{slug}.
-- visibility (who may access) and publication_status (lifecycle) are separate columns.
-- processing_status mirrors the upload and processing pipeline (PENDING, UPLOADING, PROCESSING, READY, FAILED).
-- Only the pipeline writes it, in the same transaction as the upload session or job transition.
-- view_count is maintained from video_view_events. like_count is reserved for the future likes module.
-- thumbnail_asset_id gets its foreign key in 0005, after video_assets exists.
-- Default visibility is PRIVATE so a row inserted without an explicit choice is never exposed.
-- is_ai_generated has no default on purpose. The creator must declare it.

CREATE TABLE videos (
    id                 uuid          NOT NULL DEFAULT gen_random_uuid(),
    creator_id         uuid          NOT NULL,
    series_id          uuid,
    season_id          uuid,
    episode_number     integer,
    video_type         varchar(10)   NOT NULL,
    title              varchar(200)  NOT NULL,
    slug               varchar(120)  NOT NULL,
    description        varchar(5000) NOT NULL DEFAULT '',
    thumbnail_asset_id uuid,
    duration_seconds   integer,
    genre              varchar(40),
    language           varchar(35)   NOT NULL DEFAULT 'en',
    visibility         varchar(20)   NOT NULL DEFAULT 'PRIVATE',
    publication_status varchar(20)   NOT NULL DEFAULT 'DRAFT',
    processing_status  varchar(20)   NOT NULL DEFAULT 'PENDING',
    content_rating     varchar(20),
    is_ai_generated    boolean       NOT NULL,
    allow_comments     boolean       NOT NULL DEFAULT true,
    view_count         bigint        NOT NULL DEFAULT 0,
    like_count         bigint        NOT NULL DEFAULT 0,
    published_at       timestamptz,
    version            bigint        NOT NULL DEFAULT 0,
    created_at         timestamptz   NOT NULL DEFAULT now(),
    updated_at         timestamptz   NOT NULL DEFAULT now(),
    deleted_at         timestamptz,
    CONSTRAINT pk_videos PRIMARY KEY (id),
    CONSTRAINT uq_videos_slug UNIQUE (slug),
    CONSTRAINT uq_videos_id_creator UNIQUE (id, creator_id),
    CONSTRAINT fk_videos_creator FOREIGN KEY (creator_id) REFERENCES users (id) ON DELETE RESTRICT,
    -- Series must belong to the same creator as the video.
    CONSTRAINT fk_videos_series FOREIGN KEY (series_id, creator_id) REFERENCES drama_series (id, creator_id) ON DELETE RESTRICT,
    -- Season must belong to the video's series. Episodes always carry both ids (see ck_videos_episode_shape).
    CONSTRAINT fk_videos_season FOREIGN KEY (season_id, series_id) REFERENCES drama_seasons (id, series_id) ON DELETE RESTRICT,
    CONSTRAINT ck_videos_video_type CHECK (video_type IN ('MOVIE', 'EPISODE', 'SHORT', 'TRAILER', 'TEASER')),
    CONSTRAINT ck_videos_visibility CHECK (visibility IN ('PUBLIC', 'UNLISTED', 'PRIVATE')),
    CONSTRAINT ck_videos_publication_status CHECK (publication_status IN
        ('DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'UNPUBLISHED', 'FAILED', 'REMOVED')),
    CONSTRAINT ck_videos_processing_status CHECK (processing_status IN
        ('PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT ck_videos_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT ck_videos_title CHECK (title = btrim(title) AND title <> ''),
    CONSTRAINT ck_videos_genre CHECK (genre IS NULL OR (genre = btrim(genre) AND genre <> '')),
    CONSTRAINT ck_videos_duration CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT ck_videos_counters CHECK (view_count >= 0 AND like_count >= 0),
    -- Episodes live in a season of a series and have a number. Every other type has neither.
    CONSTRAINT ck_videos_episode_shape CHECK (
        (video_type = 'EPISODE' AND series_id IS NOT NULL AND season_id IS NOT NULL
            AND episode_number IS NOT NULL AND episode_number > 0)
        OR (video_type <> 'EPISODE' AND season_id IS NULL AND episode_number IS NULL)),
    -- A video must finish processing before it can be READY or PUBLISHED.
    CONSTRAINT ck_videos_ready_requires_processed CHECK (
        publication_status NOT IN ('READY', 'PUBLISHED') OR processing_status = 'READY'),
    CONSTRAINT ck_videos_published_has_timestamp CHECK (publication_status <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT ck_videos_published_has_genre CHECK (publication_status <> 'PUBLISHED' OR genre IS NOT NULL)
);

CREATE TRIGGER trg_videos_set_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Episode number is unique within a season among live videos. Also serves "episodes of a season".
CREATE UNIQUE INDEX uq_videos_season_episode_live ON videos (season_id, episode_number)
    WHERE season_id IS NOT NULL AND deleted_at IS NULL;

-- Public discovery. All four share the predicate: PUBLISHED and PUBLIC and not deleted.
-- Keyset pagination on (published_at DESC, id DESC).
CREATE INDEX ix_videos_public_recent ON videos (published_at DESC, id DESC)
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL;
CREATE INDEX ix_videos_public_type_recent ON videos (video_type, published_at DESC, id DESC)
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL;
CREATE INDEX ix_videos_public_genre_recent ON videos (genre, published_at DESC, id DESC)
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL;
CREATE INDEX ix_videos_public_trending ON videos (view_count DESC, id DESC)
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL;

-- Creator dashboard: own videos, newest first, any status.
CREATE INDEX ix_videos_creator_recent ON videos (creator_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;

-- Series page, trailers of a series, and the series delete guard (0009).
CREATE INDEX ix_videos_series ON videos (series_id) WHERE series_id IS NOT NULL;

--rollback DROP TABLE videos;
