--liquibase formatted sql

--changeset aidrama:0008-video-view-events dbms:postgresql
-- Append-only playback events. Rows are never updated. Raw rows are purged after the retention window.
-- viewer_key is a salted hash of an anonymous or session identifier. Never store raw IP addresses.
-- dedupe_key (computed by the backend, e.g. hash of viewer and time bucket) makes counting idempotent:
--   INSERT ... ON CONFLICT (video_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING,
-- and videos.view_count is incremented only when a row was actually inserted.
-- Volume: at high scale, move to monthly range partitions (needs the partition key in the primary key).
-- That would be a new table plus backfill (expand and contract), not an edit to this file.

CREATE TABLE video_view_events (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    video_id        uuid        NOT NULL,
    viewer_user_id  uuid,
    viewer_key      varchar(64) NOT NULL,
    event_type      varchar(20) NOT NULL,
    watched_seconds integer     NOT NULL DEFAULT 0,
    dedupe_key      varchar(64),
    occurred_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_video_view_events PRIMARY KEY (id),
    CONSTRAINT fk_video_view_events_video FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE RESTRICT,
    CONSTRAINT fk_video_view_events_viewer FOREIGN KEY (viewer_user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT ck_video_view_events_type CHECK (event_type IN ('PLAY_START', 'VIEW_QUALIFIED', 'PLAY_COMPLETE')),
    CONSTRAINT ck_video_view_events_watched CHECK (watched_seconds >= 0)
);

-- Per-video analytics over a time range.
CREATE INDEX ix_video_view_events_video_time ON video_view_events (video_id, occurred_at DESC);
-- Idempotent counting.
CREATE UNIQUE INDEX uq_video_view_events_dedupe ON video_view_events (video_id, dedupe_key)
    WHERE dedupe_key IS NOT NULL;
-- Retention purge by age. BRIN is tiny and fits append-only time order.
CREATE INDEX ix_video_view_events_occurred_brin ON video_view_events USING brin (occurred_at);

--rollback DROP TABLE video_view_events;
