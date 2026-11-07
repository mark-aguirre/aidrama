--liquibase formatted sql

--changeset aidrama:0012-video-likes dbms:postgresql
-- Per-user likes. One row per (video, user); only authenticated users can like. Additive only: new table, no change to videos.
-- videos.like_count (0004) stays the denormalized display counter. This table is the source of truth for "who liked what".
-- Toggle protocol the backend follows, in ONE short transaction:
--   like:   INSERT INTO video_likes (video_id, user_id) VALUES (?, ?) ON CONFLICT (video_id, user_id) DO NOTHING;
--           bump videos.like_count + 1 only when a row was actually inserted (row count = 1).
--   unlike: DELETE FROM video_likes WHERE video_id = ? AND user_id = ?;
--           bump videos.like_count - 1 only when a row was actually deleted (row count = 1).
-- uq_video_likes_video_user is the idempotency key, so a double click or retry cannot count twice.
-- It also serves "did this user like this video" and "how many likes does this video have" (video_id is the leading column).
-- No (user_id, ...) index on purpose: no "videos I liked" query exists yet. Add one in a new changeset when that screen is built.
-- Until then, hard-deleting a user scans this table once for the user_id cascade. Users are soft deleted in normal operation.
-- Delete behavior: ON DELETE CASCADE on both FKs. A hard-deleted user or video removes its likes. Soft delete (deleted_at) does not
-- touch likes, so the backend must hide likes of soft-deleted videos by filtering on videos.deleted_at.
-- Rows are never updated, so there is no updated_at and no version column.

CREATE TABLE video_likes (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    video_id   uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_video_likes PRIMARY KEY (id),
    CONSTRAINT uq_video_likes_video_user UNIQUE (video_id, user_id),
    CONSTRAINT fk_video_likes_video FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE CASCADE,
    CONSTRAINT fk_video_likes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

--rollback DROP TABLE video_likes;
