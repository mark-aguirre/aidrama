-- Constraint and integrity tests. Runs inside one transaction and ends with ROLLBACK.
-- Synthetic data only. Run with: psql -v ON_ERROR_STOP=1 -f constraints-test.sql
BEGIN;
-- Hide the empty result rows of SELECT pg_temp.expect(...). NOTICE lines still print.
\o /dev/null

CREATE FUNCTION pg_temp.expect(label text, stmt text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = expected THEN
            RAISE NOTICE 'PASS  %  (%)', label, SQLSTATE;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  %: expected %, got % (%)', label, expected, SQLSTATE, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  %: statement succeeded, expected %', label, expected;
END
$$;

-- ---------------------------------------------------------------- fixtures
INSERT INTO users (id, email, username, password_hash) VALUES
    ('11111111-1111-4111-8111-111111111111', 'alice@example.test', 'alice', 'x'),
    ('22222222-2222-4222-8222-222222222222', 'bob@example.test',   'bob',   'x');
INSERT INTO user_profiles (user_id, display_name) VALUES
    ('11111111-1111-4111-8111-111111111111', 'Alice'),
    ('22222222-2222-4222-8222-222222222222', 'Bob');
INSERT INTO user_roles (user_id, role) VALUES
    ('11111111-1111-4111-8111-111111111111', 'USER'),
    ('11111111-1111-4111-8111-111111111111', 'CREATOR');

INSERT INTO drama_series (id, creator_id, title, slug) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Series One', 'series-one'),
    ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Series Two', 'series-two');
INSERT INTO drama_seasons (id, series_id, season_number) VALUES
    ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1),
    ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000002', 1);

INSERT INTO videos (id, creator_id, series_id, season_id, episode_number, video_type, title, slug, is_ai_generated) VALUES
    ('cccccccc-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', NULL, NULL, NULL, 'MOVIE', 'Movie', 'movie', true),
    ('cccccccc-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
        'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 1, 'EPISODE', 'Ep1', 'ep-1', true),
    ('dddddddd-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', NULL, NULL, NULL, 'SHORT', 'Bob short', 'bob-short', true);

INSERT INTO video_assets (id, video_id, asset_type, storage_bucket, storage_key) VALUES
    ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'ORIGINAL',  'media', 'orig/movie.mp4'),
    ('eeeeeeee-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000001', 'THUMBNAIL', 'media', 'thumb/movie.jpg'),
    ('eeeeeeee-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000001', 'ORIGINAL',  'media', 'orig/bob.mp4');

-- ---------------------------------------------------------------- users
SELECT pg_temp.expect('username unique',
    $q$INSERT INTO users (email, username, password_hash) VALUES ('other@example.test', 'alice', 'x')$q$, '23505');
SELECT pg_temp.expect('email unique',
    $q$INSERT INTO users (email, username, password_hash) VALUES ('alice@example.test', 'alice2', 'x')$q$, '23505');
SELECT pg_temp.expect('email must be lowercase',
    $q$INSERT INTO users (email, username, password_hash) VALUES ('Carol@Example.test', 'carol', 'x')$q$, '23514');
SELECT pg_temp.expect('username must be lowercase format',
    $q$INSERT INTO users (email, username, password_hash) VALUES ('c@example.test', 'Carol!', 'x')$q$, '23514');
SELECT pg_temp.expect('role must be known',
    $q$INSERT INTO user_roles (user_id, role) VALUES ('22222222-2222-4222-8222-222222222222', 'ROOT')$q$, '23514');
SELECT pg_temp.expect('role unique per user',
    $q$INSERT INTO user_roles (user_id, role) VALUES ('11111111-1111-4111-8111-111111111111', 'CREATOR')$q$, '23505');

-- ---------------------------------------------------------------- slugs and enums
SELECT pg_temp.expect('video slug unique',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated)
       VALUES ('22222222-2222-4222-8222-222222222222', 'SHORT', 'Dup', 'movie', true)$q$, '23505');
SELECT pg_temp.expect('series slug unique',
    $q$INSERT INTO drama_series (creator_id, title, slug)
       VALUES ('22222222-2222-4222-8222-222222222222', 'Dup', 'series-one')$q$, '23505');
SELECT pg_temp.expect('slug format',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated)
       VALUES ('22222222-2222-4222-8222-222222222222', 'SHORT', 'Bad', 'Bad Slug', true)$q$, '23514');
-- Same slug text is allowed in the series namespace and the video namespace.
INSERT INTO drama_series (creator_id, title, slug) VALUES ('22222222-2222-4222-8222-222222222222', 'Bob series', 'movie');

SELECT pg_temp.expect('video_type enum',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated)
       VALUES ('22222222-2222-4222-8222-222222222222', 'CLIP', 'x', 'x1', true)$q$, '23514');
SELECT pg_temp.expect('visibility enum',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated, visibility)
       VALUES ('22222222-2222-4222-8222-222222222222', 'SHORT', 'x', 'x2', true, 'SECRET')$q$, '23514');
SELECT pg_temp.expect('publication_status enum',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated, publication_status)
       VALUES ('22222222-2222-4222-8222-222222222222', 'SHORT', 'x', 'x3', true, 'ARCHIVED')$q$, '23514');
SELECT pg_temp.expect('is_ai_generated has no default',
    $q$INSERT INTO videos (creator_id, video_type, title, slug)
       VALUES ('22222222-2222-4222-8222-222222222222', 'SHORT', 'x', 'x4')$q$, '23502');

-- ---------------------------------------------------------------- episodes and series shape
SELECT pg_temp.expect('episode number unique within season',
    $q$INSERT INTO videos (creator_id, series_id, season_id, episode_number, video_type, title, slug, is_ai_generated)
       VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
               'bbbbbbbb-0000-4000-8000-000000000001', 1, 'EPISODE', 'Ep1 again', 'ep-1-again', true)$q$, '23505');
-- Same number in a different season is fine.
INSERT INTO videos (creator_id, series_id, season_id, episode_number, video_type, title, slug, is_ai_generated)
VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000002',
        'bbbbbbbb-0000-4000-8000-000000000002', 1, 'EPISODE', 'S2E1', 's2-ep-1', true);
SELECT pg_temp.expect('episode needs a season',
    $q$INSERT INTO videos (creator_id, series_id, video_type, title, slug, is_ai_generated)
       VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'EPISODE', 'x', 'x5', true)$q$, '23514');
SELECT pg_temp.expect('movie cannot have a season',
    $q$INSERT INTO videos (creator_id, series_id, season_id, video_type, title, slug, is_ai_generated)
       VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
               'bbbbbbbb-0000-4000-8000-000000000001', 'MOVIE', 'x', 'x6', true)$q$, '23514');
SELECT pg_temp.expect('season number unique within series',
    $q$INSERT INTO drama_seasons (series_id, season_number) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 1)$q$, '23505');
SELECT pg_temp.expect('cross-creator series reference blocked',
    $q$INSERT INTO videos (creator_id, series_id, video_type, title, slug, is_ai_generated)
       VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000001', 'TRAILER', 'x', 'x7', true)$q$, '23503');
SELECT pg_temp.expect('season of another series blocked',
    $q$INSERT INTO videos (creator_id, series_id, season_id, episode_number, video_type, title, slug, is_ai_generated)
       VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
               'bbbbbbbb-0000-4000-8000-000000000002', 9, 'EPISODE', 'x', 'x8', true)$q$, '23503');

-- ---------------------------------------------------------------- publication rules
SELECT pg_temp.expect('cannot publish before processing is READY',
    $q$UPDATE videos SET publication_status = 'PUBLISHED', visibility = 'PUBLIC', genre = 'Drama', published_at = now()
       WHERE id = 'cccccccc-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect('cannot be READY before processing is READY',
    $q$UPDATE videos SET publication_status = 'READY' WHERE id = 'cccccccc-0000-4000-8000-000000000001'$q$, '23514');
UPDATE videos SET processing_status = 'READY' WHERE id = 'cccccccc-0000-4000-8000-000000000001';
-- READY but still a draft is legal.
UPDATE videos SET publication_status = 'DRAFT' WHERE id = 'cccccccc-0000-4000-8000-000000000001';
SELECT pg_temp.expect('published needs published_at',
    $q$UPDATE videos SET publication_status = 'PUBLISHED', genre = 'Drama' WHERE id = 'cccccccc-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect('published needs genre',
    $q$UPDATE videos SET publication_status = 'PUBLISHED', published_at = now() WHERE id = 'cccccccc-0000-4000-8000-000000000001'$q$, '23514');
-- PUBLISHED but UNLISTED is legal: visibility and publication_status are independent.
UPDATE videos SET publication_status = 'PUBLISHED', visibility = 'UNLISTED', genre = 'Drama', published_at = now()
WHERE id = 'cccccccc-0000-4000-8000-000000000001';
UPDATE videos SET visibility = 'PUBLIC' WHERE id = 'cccccccc-0000-4000-8000-000000000001';

-- updated_at is maintained by trigger even if a stale value is written.
UPDATE videos SET title = 'Movie v2', updated_at = '2000-01-01T00:00:00Z' WHERE id = 'cccccccc-0000-4000-8000-000000000001';
DO $$ BEGIN
    IF (SELECT updated_at FROM videos WHERE id = 'cccccccc-0000-4000-8000-000000000001') < now() - interval '1 minute' THEN
        RAISE EXCEPTION 'FAIL  updated_at trigger did not fire';
    END IF;
    RAISE NOTICE 'PASS  updated_at trigger';
END $$;

-- ---------------------------------------------------------------- assets
SELECT pg_temp.expect('one ORIGINAL per video',
    $q$INSERT INTO video_assets (video_id, asset_type, storage_bucket, storage_key)
       VALUES ('cccccccc-0000-4000-8000-000000000001', 'ORIGINAL', 'media', 'orig/movie-2.mp4')$q$, '23505');
SELECT pg_temp.expect('storage object unique',
    $q$INSERT INTO video_assets (video_id, asset_type, storage_bucket, storage_key)
       VALUES ('cccccccc-0000-4000-8000-000000000001', 'HLS_MASTER', 'media', 'orig/movie.mp4')$q$, '23505');
SELECT pg_temp.expect('asset_type enum',
    $q$INSERT INTO video_assets (video_id, asset_type, storage_bucket, storage_key)
       VALUES ('cccccccc-0000-4000-8000-000000000001', 'AUDIO', 'media', 'a')$q$, '23514');
SELECT pg_temp.expect('thumbnail from another video blocked',
    $q$UPDATE videos SET thumbnail_asset_id = 'eeeeeeee-0000-4000-8000-000000000003'
       WHERE id = 'cccccccc-0000-4000-8000-000000000001'$q$, '23503');
UPDATE videos SET thumbnail_asset_id = 'eeeeeeee-0000-4000-8000-000000000002' WHERE id = 'cccccccc-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------- upload sessions
INSERT INTO upload_sessions (id, creator_id, video_id, original_filename, content_type, declared_size_bytes, storage_bucket, storage_key, expires_at, idempotency_key)
VALUES ('f0f0f0f0-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001',
        'movie.mp4', 'video/mp4', 1000, 'media', 'orig/movie.mp4-session', now() + interval '1 day', 'idem-1');
SELECT pg_temp.expect('uploader must own the video',
    $q$INSERT INTO upload_sessions (creator_id, video_id, original_filename, content_type, declared_size_bytes, storage_bucket, storage_key, expires_at, status)
       VALUES ('22222222-2222-4222-8222-222222222222', 'cccccccc-0000-4000-8000-000000000001', 'x.mp4', 'video/mp4', 10, 'media', 'k-owner', now() + interval '1 day', 'CANCELLED')$q$, '23503');
SELECT pg_temp.expect('one active upload per video',
    $q$INSERT INTO upload_sessions (creator_id, video_id, original_filename, content_type, declared_size_bytes, storage_bucket, storage_key, expires_at)
       VALUES ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'x.mp4', 'video/mp4', 10, 'media', 'k-active', now() + interval '1 day')$q$, '23505');
SELECT pg_temp.expect('idempotency key unique per creator',
    $q$INSERT INTO upload_sessions (creator_id, video_id, original_filename, content_type, declared_size_bytes, storage_bucket, storage_key, expires_at, status, idempotency_key)
       VALUES ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'x.mp4', 'video/mp4', 10, 'media', 'k-idem', now() + interval '1 day', 'CANCELLED', 'idem-1')$q$, '23505');
SELECT pg_temp.expect('uploaded_bytes cannot exceed declared size',
    $q$UPDATE upload_sessions SET uploaded_bytes = 2000 WHERE id = 'f0f0f0f0-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect('FAILED upload needs a reason',
    $q$UPDATE upload_sessions SET status = 'FAILED' WHERE id = 'f0f0f0f0-0000-4000-8000-000000000001'$q$, '23514');
-- After the session ends, a retry session is allowed.
UPDATE upload_sessions SET status = 'FAILED', failure_code = 'NETWORK', failure_message = 'Connection lost'
WHERE id = 'f0f0f0f0-0000-4000-8000-000000000001';
INSERT INTO upload_sessions (creator_id, video_id, original_filename, content_type, declared_size_bytes, storage_bucket, storage_key, expires_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-000000000001', 'movie.mp4', 'video/mp4', 1000, 'media', 'orig/movie.mp4-retry', now() + interval '1 day');

-- ---------------------------------------------------------------- processing jobs
INSERT INTO processing_jobs (id, video_id, source_asset_id)
VALUES ('f1f1f1f1-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001');
SELECT pg_temp.expect('one active job per video',
    $q$INSERT INTO processing_jobs (video_id, source_asset_id)
       VALUES ('cccccccc-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001')$q$, '23505');
SELECT pg_temp.expect('source asset must belong to the same video',
    $q$INSERT INTO processing_jobs (video_id, source_asset_id)
       VALUES ('dddddddd-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001')$q$, '23503');
SELECT pg_temp.expect('PROCESSING job needs started_at',
    $q$UPDATE processing_jobs SET status = 'PROCESSING' WHERE id = 'f1f1f1f1-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect('FAILED job needs a reason',
    $q$UPDATE processing_jobs SET status = 'FAILED', finished_at = now() WHERE id = 'f1f1f1f1-0000-4000-8000-000000000001'$q$, '23514');
SELECT pg_temp.expect('progress range',
    $q$UPDATE processing_jobs SET progress_percent = 101 WHERE id = 'f1f1f1f1-0000-4000-8000-000000000001'$q$, '23514');
UPDATE processing_jobs SET status = 'PROCESSING', started_at = now(), heartbeat_at = now(), attempt_count = 1
WHERE id = 'f1f1f1f1-0000-4000-8000-000000000001';
UPDATE processing_jobs SET status = 'READY', finished_at = now(), progress_percent = 100
WHERE id = 'f1f1f1f1-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------- view events
INSERT INTO video_view_events (video_id, viewer_key, event_type, dedupe_key)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'k1', 'VIEW_QUALIFIED', 'd1');
SELECT pg_temp.expect('duplicate view dedupe_key blocked',
    $q$INSERT INTO video_view_events (video_id, viewer_key, event_type, dedupe_key)
       VALUES ('cccccccc-0000-4000-8000-000000000001', 'k1', 'VIEW_QUALIFIED', 'd1')$q$, '23505');
INSERT INTO video_view_events (video_id, viewer_key, event_type, dedupe_key)
VALUES ('cccccccc-0000-4000-8000-000000000001', 'k1', 'VIEW_QUALIFIED', 'd1')
ON CONFLICT (video_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
SELECT pg_temp.expect('event_type enum',
    $q$INSERT INTO video_view_events (video_id, viewer_key, event_type)
       VALUES ('cccccccc-0000-4000-8000-000000000001', 'k1', 'CLICK')$q$, '23514');

-- ---------------------------------------------------------------- soft delete guards and RESTRICT
SELECT pg_temp.expect('series soft delete blocked while live seasons/videos exist',
    $q$UPDATE drama_series SET deleted_at = now() WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$, '23503');
SELECT pg_temp.expect('season soft delete blocked while live videos exist',
    $q$UPDATE drama_seasons SET deleted_at = now() WHERE id = 'bbbbbbbb-0000-4000-8000-000000000001'$q$, '23503');
SELECT pg_temp.expect('hard delete of series with videos blocked (RESTRICT)',
    $q$DELETE FROM drama_series WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001'$q$, '23503');
-- Children first, then parents: allowed.
UPDATE videos SET deleted_at = now() WHERE id = 'cccccccc-0000-4000-8000-000000000002';
UPDATE drama_seasons SET deleted_at = now() WHERE id = 'bbbbbbbb-0000-4000-8000-000000000001';
UPDATE drama_series  SET deleted_at = now() WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';
SELECT pg_temp.expect('cannot attach a live video to a soft-deleted series',
    $q$INSERT INTO videos (creator_id, series_id, video_type, title, slug, is_ai_generated)
       VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'TRAILER', 'x', 'x9', true)$q$, '23503');
-- Soft-deleted episode frees its number and slug stays reserved.
INSERT INTO videos (creator_id, series_id, season_id, episode_number, video_type, title, slug, is_ai_generated, deleted_at)
VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
        'bbbbbbbb-0000-4000-8000-000000000001', 1, 'EPISODE', 'Ep1 deleted twin', 'ep-1-deleted-twin', true, now());
SELECT pg_temp.expect('soft-deleted video keeps its slug reserved',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated)
       VALUES ('22222222-2222-4222-8222-222222222222', 'SHORT', 'x', 'ep-1', true)$q$, '23505');

-- Deleting an asset nulls only the thumbnail pointer.
DELETE FROM video_assets WHERE id = 'eeeeeeee-0000-4000-8000-000000000002';
DO $$ BEGIN
    IF (SELECT thumbnail_asset_id FROM videos WHERE id = 'cccccccc-0000-4000-8000-000000000001') IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL  thumbnail pointer not nulled';
    END IF;
    RAISE NOTICE 'PASS  thumbnail ON DELETE SET NULL (column list)';
END $$;

-- ---------------------------------------------------------------- trailer link (0011)
-- Like expect(), and also asserts the constraint name the backend maps on.
CREATE FUNCTION pg_temp.expect_c(label text, stmt text, expected text, expected_constraint text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE c text;
BEGIN
    BEGIN
        EXECUTE stmt;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
        IF SQLSTATE = expected AND c = expected_constraint THEN
            RAISE NOTICE 'PASS  %  (% %)', label, SQLSTATE, c;
            RETURN;
        END IF;
        RAISE EXCEPTION 'FAIL  %: expected % %, got % % (%)', label, expected, expected_constraint, SQLSTATE, c, SQLERRM;
    END;
    RAISE EXCEPTION 'FAIL  %: statement succeeded, expected % %', label, expected, expected_constraint;
END
$$;

-- Alice: parents m1, m2 (MOVIE), s1 (SHORT, not a trailer), trailers t1, t2. Bob: trailer bt.
INSERT INTO videos (id, creator_id, video_type, title, slug, is_ai_generated) VALUES
    ('cccccccc-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'MOVIE',   'Parent one',  'parent-one',  true),
    ('cccccccc-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', 'MOVIE',   'Parent two',  'parent-two',  true),
    ('cccccccc-0000-4000-8000-0000000000a3', '11111111-1111-4111-8111-111111111111', 'SHORT',   'Not trailer', 'not-trailer', true),
    ('cccccccc-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111', 'TRAILER', 'Trailer one', 'trailer-one', true),
    ('cccccccc-0000-4000-8000-0000000000b2', '11111111-1111-4111-8111-111111111111', 'TRAILER', 'Trailer two', 'trailer-two', true),
    ('dddddddd-0000-4000-8000-0000000000b1', '22222222-2222-4222-8222-222222222222', 'TRAILER', 'Bob trailer', 'bob-trailer', true);

SELECT pg_temp.expect_c('link to a non-TRAILER video fails',
    $q$UPDATE videos SET trailer_video_id = 'cccccccc-0000-4000-8000-0000000000a3' WHERE id = 'cccccccc-0000-4000-8000-0000000000a1'$q$,
    '23514', 'ck_videos_trailer_must_be_trailer');
SELECT pg_temp.expect_c('insert with a non-TRAILER link fails',
    $q$INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated, trailer_video_id)
       VALUES ('11111111-1111-4111-8111-111111111111', 'MOVIE', 'x', 'tl-ins-1', true, 'cccccccc-0000-4000-8000-0000000000a3')$q$,
    '23514', 'ck_videos_trailer_must_be_trailer');
SELECT pg_temp.expect_c('self reference fails (update)',
    $q$UPDATE videos SET trailer_video_id = id WHERE id = 'cccccccc-0000-4000-8000-0000000000a1'$q$,
    '23514', 'ck_videos_trailer_not_self');
SELECT pg_temp.expect_c('self reference fails (insert with explicit id)',
    $q$INSERT INTO videos (id, creator_id, video_type, title, slug, is_ai_generated, trailer_video_id)
       VALUES ('cccccccc-0000-4000-8000-0000000000a9', '11111111-1111-4111-8111-111111111111', 'MOVIE', 'x', 'tl-self', true,
               'cccccccc-0000-4000-8000-0000000000a9')$q$,
    '23514', 'ck_videos_trailer_not_self');
SELECT pg_temp.expect_c('unknown trailer id fails',
    $q$UPDATE videos SET trailer_video_id = '99999999-0000-4000-8000-000000000000' WHERE id = 'cccccccc-0000-4000-8000-0000000000a1'$q$,
    '23503', 'fk_videos_trailer_video');
SELECT pg_temp.expect_c('another creator''s trailer cannot be linked',
    $q$UPDATE videos SET trailer_video_id = 'dddddddd-0000-4000-8000-0000000000b1' WHERE id = 'cccccccc-0000-4000-8000-0000000000a1'$q$,
    '23503', 'fk_videos_trailer_video');
SELECT pg_temp.expect_c('a TRAILER cannot carry a trailer',
    $q$UPDATE videos SET trailer_video_id = 'cccccccc-0000-4000-8000-0000000000b2' WHERE id = 'cccccccc-0000-4000-8000-0000000000b1'$q$,
    '23514', 'ck_videos_trailer_no_nesting');

-- A real TRAILER links.
UPDATE videos SET trailer_video_id = 'cccccccc-0000-4000-8000-0000000000b1' WHERE id = 'cccccccc-0000-4000-8000-0000000000a1';
DO $$ BEGIN
    IF (SELECT trailer_video_id FROM videos WHERE id = 'cccccccc-0000-4000-8000-0000000000a1') IS DISTINCT FROM 'cccccccc-0000-4000-8000-0000000000b1' THEN
        RAISE EXCEPTION 'FAIL  linking a real TRAILER did not persist';
    END IF;
    RAISE NOTICE 'PASS  linking a real TRAILER succeeds';
END $$;
-- Insert-time link also works, and re-saving an unchanged link is accepted.
INSERT INTO videos (creator_id, video_type, title, slug, is_ai_generated, trailer_video_id)
VALUES ('11111111-1111-4111-8111-111111111111', 'SHORT', 'Linked at insert', 'tl-ins-ok', true, 'cccccccc-0000-4000-8000-0000000000b2');
UPDATE videos SET title = 'Parent one v2' WHERE id = 'cccccccc-0000-4000-8000-0000000000a1';

SELECT pg_temp.expect_c('two parents cannot share one trailer',
    $q$UPDATE videos SET trailer_video_id = 'cccccccc-0000-4000-8000-0000000000b1' WHERE id = 'cccccccc-0000-4000-8000-0000000000a2'$q$,
    '23505', 'uq_videos_trailer_video');
SELECT pg_temp.expect_c('a linked trailer cannot be re-typed',
    $q$UPDATE videos SET video_type = 'TEASER' WHERE id = 'cccccccc-0000-4000-8000-0000000000b1'$q$,
    '23514', 'ck_videos_trailer_must_be_trailer');
-- An unlinked trailer can still be re-typed.
UPDATE videos SET video_type = 'TEASER' WHERE id = 'dddddddd-0000-4000-8000-0000000000b1';

-- Soft delete: a deleted trailer cannot be newly linked. An existing link survives the soft delete and the parent stays editable.
INSERT INTO videos (id, creator_id, video_type, title, slug, is_ai_generated, deleted_at) VALUES
    ('cccccccc-0000-4000-8000-0000000000b3', '11111111-1111-4111-8111-111111111111', 'TRAILER', 'Deleted trailer', 'trailer-deleted', true, now());
SELECT pg_temp.expect_c('a soft-deleted trailer cannot be newly linked',
    $q$UPDATE videos SET trailer_video_id = 'cccccccc-0000-4000-8000-0000000000b3' WHERE id = 'cccccccc-0000-4000-8000-0000000000a2'$q$,
    '23503', 'fk_videos_trailer_live');
UPDATE videos SET deleted_at = now() WHERE id = 'cccccccc-0000-4000-8000-0000000000b1';
UPDATE videos SET title = 'Parent one v3' WHERE id = 'cccccccc-0000-4000-8000-0000000000a1';
DO $$ BEGIN
    IF (SELECT trailer_video_id FROM videos WHERE id = 'cccccccc-0000-4000-8000-0000000000a1') IS DISTINCT FROM 'cccccccc-0000-4000-8000-0000000000b1' THEN
        RAISE EXCEPTION 'FAIL  link was cleared by soft delete of the trailer';
    END IF;
    RAISE NOTICE 'PASS  soft-deleted trailer keeps the link (backend filters deleted_at IS NULL)';
END $$;
-- Backend clears the link, then the freed trailer id can back another title.
UPDATE videos SET trailer_video_id = NULL WHERE id = 'cccccccc-0000-4000-8000-0000000000a1';
UPDATE videos SET deleted_at = NULL WHERE id = 'cccccccc-0000-4000-8000-0000000000b1';
UPDATE videos SET trailer_video_id = 'cccccccc-0000-4000-8000-0000000000b1' WHERE id = 'cccccccc-0000-4000-8000-0000000000a2';

-- Hard delete of the trailer nulls only the parent's link; creator_id stays.
DELETE FROM videos WHERE id = 'cccccccc-0000-4000-8000-0000000000b1';
DO $$ BEGIN
    IF (SELECT trailer_video_id FROM videos WHERE id = 'cccccccc-0000-4000-8000-0000000000a2') IS NOT NULL
       OR (SELECT creator_id FROM videos WHERE id = 'cccccccc-0000-4000-8000-0000000000a2') IS NULL THEN
        RAISE EXCEPTION 'FAIL  ON DELETE SET NULL (trailer_video_id) did not behave';
    END IF;
    RAISE NOTICE 'PASS  trailer ON DELETE SET NULL (column list)';
END $$;

-- The unique index backs both the one-trailer rule and the lookup of a trailer's parent.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_videos_trailer_video'
                   AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%WHERE (trailer_video_id IS NOT NULL)%') THEN
        RAISE EXCEPTION 'FAIL  uq_videos_trailer_video missing or not a partial unique index';
    END IF;
    RAISE NOTICE 'PASS  uq_videos_trailer_video is a partial unique index';
END $$;

-- ---------------------------------------------------------------- catalog-level invariants
DO $$
DECLARE bad text;
BEGIN
    -- Every table in scope has a uuid primary key (single column, or user_id for user_profiles).
    SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r' AND c.relname NOT LIKE 'databasechangelog%'
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint k
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
        WHERE k.conrelid = c.oid AND k.contype = 'p' AND array_length(k.conkey, 1) = 1 AND a.atttypid = 'uuid'::regtype);
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL  non-uuid primary key on: %', bad; END IF;
    RAISE NOTICE 'PASS  all primary keys are single-column uuid';

    -- No naive timestamps anywhere.
    SELECT string_agg(table_name || '.' || column_name, ', ') INTO bad
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'timestamp without time zone' AND table_name NOT LIKE 'databasechangelog%';
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL  timestamp without time zone: %', bad; END IF;
    RAISE NOTICE 'PASS  all timestamps are timestamptz';

    -- Soft delete column exists on user-generated content.
    SELECT string_agg(t, ', ') INTO bad
    FROM unnest(ARRAY['users', 'drama_series', 'drama_seasons', 'videos']) t
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = t AND column_name = 'deleted_at');
    IF bad IS NOT NULL THEN RAISE EXCEPTION 'FAIL  missing deleted_at on: %', bad; END IF;
    RAISE NOTICE 'PASS  deleted_at present on users, drama_series, drama_seasons, videos';

    -- Exactly the ten tables in scope.
    SELECT string_agg(relname, ', ' ORDER BY relname) INTO bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE c.relkind = 'r' AND c.relname NOT LIKE 'databasechangelog%';
    IF bad <> 'drama_seasons, drama_series, processing_jobs, upload_sessions, user_profiles, user_roles, users, video_assets, video_view_events, videos' THEN
        RAISE EXCEPTION 'FAIL  unexpected table set: %', bad;
    END IF;
    RAISE NOTICE 'PASS  exactly the 10 in-scope tables exist';
END $$;

ROLLBACK;
