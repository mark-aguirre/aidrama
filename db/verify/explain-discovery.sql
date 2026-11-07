-- Synthetic data volume test and query-plan review for discovery and dashboard queries.
-- Throwaway database only. All rows are generated, deterministic, and contain no real data.
-- Run with: psql -v ON_ERROR_STOP=1 -f explain-discovery.sql
\set ON_ERROR_STOP on
\timing off

-- ---------------------------------------------------------------- seed
INSERT INTO users (id, email, username, password_hash)
SELECT gen_random_uuid(), 'user' || i || '@example.test', 'user' || i, 'x' FROM generate_series(1, 5000) i;

CREATE TEMP TABLE seed_users AS
SELECT row_number() OVER (ORDER BY username)::int AS n, id FROM users;
CREATE UNIQUE INDEX ON seed_users (n);

INSERT INTO drama_series (id, creator_id, title, slug, genre, visibility, publication_status, published_at)
SELECT gen_random_uuid(), su.id, 'Series ' || i, 'series-' || i,
       (ARRAY['Drama','Fantasy','Action','Romance','Horror','Comedy'])[1 + i % 6],
       'PUBLIC', 'PUBLISHED', now() - (i || ' hours')::interval
FROM generate_series(1, 2000) i JOIN seed_users su ON su.n = 1 + (i * 37) % 5000;

INSERT INTO drama_seasons (id, series_id, season_number)
SELECT gen_random_uuid(), id, 1 FROM drama_series;

-- 300,000 standalone videos. 60% PUBLISHED, 70% of those PUBLIC, 3% soft-deleted. 12 genres, 4 types.
INSERT INTO videos (id, creator_id, video_type, title, slug, genre, visibility, publication_status,
                    processing_status, is_ai_generated, view_count, published_at, created_at, deleted_at)
SELECT gen_random_uuid(), su.id,
       (ARRAY['MOVIE','SHORT','TRAILER','TEASER'])[1 + i % 4],
       'Video ' || i, 'video-' || i,
       (ARRAY['Drama','Fantasy','Action','Romance','Horror','Comedy','Thriller','Animation',
              'Historical','Science Fiction','Mystery','Documentary'])[1 + i % 12],
       (ARRAY['PUBLIC','PUBLIC','PUBLIC','PUBLIC','PUBLIC','UNLISTED','PRIVATE'])[1 + i % 7],
       CASE i % 10 WHEN 0 THEN 'PUBLISHED' WHEN 1 THEN 'PUBLISHED' WHEN 2 THEN 'PUBLISHED'
                   WHEN 3 THEN 'PUBLISHED' WHEN 4 THEN 'PUBLISHED' WHEN 5 THEN 'PUBLISHED'
                   WHEN 6 THEN 'DRAFT' WHEN 7 THEN 'PROCESSING' WHEN 8 THEN 'UNPUBLISHED' ELSE 'FAILED' END,
       CASE i % 10 WHEN 7 THEN 'PROCESSING' WHEN 9 THEN 'FAILED' WHEN 6 THEN 'PENDING' ELSE 'READY' END,
       true,
       (i::bigint * 7919) % 100000,
       CASE WHEN i % 10 IN (0,1,2,3,4,5) THEN now() - (i || ' minutes')::interval END,
       now() - (i || ' minutes')::interval,
       CASE WHEN i % 33 = 0 THEN now() END
FROM generate_series(1, 300000) i JOIN seed_users su ON su.n = 1 + ((i::bigint * 7919) % 5000)::int;

-- 20,000 episodes (10 per series), all published and public.
INSERT INTO videos (id, creator_id, series_id, season_id, episode_number, video_type, title, slug, genre,
                    visibility, publication_status, processing_status, is_ai_generated, published_at)
SELECT gen_random_uuid(), s.creator_id, s.id, se.id, e, 'EPISODE', 'Ep ' || e, s.slug || '-e' || e, s.genre,
       'PUBLIC', 'PUBLISHED', 'READY', true, s.published_at + (e || ' minutes')::interval
FROM drama_series s JOIN drama_seasons se ON se.series_id = s.id CROSS JOIN generate_series(1, 10) e;

-- Assets and jobs: one ORIGINAL asset and one finished job for 100,000 videos, plus 50 queued jobs.
CREATE TEMP TABLE seed_videos AS
SELECT row_number() OVER (ORDER BY id)::int AS n, id FROM videos WHERE video_type <> 'EPISODE';
CREATE UNIQUE INDEX ON seed_videos (n);

INSERT INTO video_assets (video_id, asset_type, processing_status, storage_bucket, storage_key)
SELECT id, 'ORIGINAL', 'READY', 'media', 'orig/' || id FROM seed_videos WHERE n <= 100000;

INSERT INTO processing_jobs (video_id, source_asset_id, status, started_at, finished_at, run_after)
SELECT video_id, id, 'READY', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'
FROM video_assets;

INSERT INTO processing_jobs (video_id, source_asset_id, status, run_after)
SELECT video_id, id, 'PENDING', now() - interval '1 minute' FROM video_assets ORDER BY id LIMIT 50;

-- 1,000,000 view events spread over 90 days, inserted in time order like a real append-only log.
INSERT INTO video_view_events (video_id, viewer_key, event_type, watched_seconds, occurred_at)
SELECT sv.id, 'k' || (i % 50000), 'PLAY_START', i % 600, now() - interval '90 days' * (1 - i / 1000000.0)
FROM generate_series(1, 1000000) i JOIN seed_videos sv ON sv.n = 1 + (i * 31) % 290000
ORDER BY i;
ANALYZE;

SELECT 'videos' AS tbl, count(*) FROM videos
UNION ALL SELECT 'videos public+published+live', count(*) FROM videos
    WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL
UNION ALL SELECT 'video_view_events', count(*) FROM video_view_events
UNION ALL SELECT 'processing_jobs', count(*) FROM processing_jobs;

-- ---------------------------------------------------------------- plans
\echo
\echo === Q1 home / recency, first page (keyset pagination) ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, published_at FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL
ORDER BY published_at DESC, id DESC LIMIT 24;

\echo
\echo === Q1b recency, deep page via keyset cursor ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, published_at FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL
  AND (published_at, id) < (now() - interval '100 days', 'ffffffff-ffff-4fff-8fff-ffffffffffff')
ORDER BY published_at DESC, id DESC LIMIT 24;

\echo
\echo === Q2 by type, recency ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, published_at FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL AND video_type = 'SHORT'
ORDER BY published_at DESC, id DESC LIMIT 24;

\echo
\echo === Q3 by genre, recency ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, published_at FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL AND genre = 'Science Fiction'
ORDER BY published_at DESC, id DESC LIMIT 24;

\echo
\echo === Q4 trending by view_count ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, view_count FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL
ORDER BY view_count DESC, id DESC LIMIT 24;

\echo
\echo === Q5 discovery that honors parent series access (episodes inherit) ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT v.id, v.slug, v.title, v.published_at FROM videos v
WHERE v.publication_status = 'PUBLISHED' AND v.visibility = 'PUBLIC' AND v.deleted_at IS NULL
  AND (v.series_id IS NULL OR EXISTS (
        SELECT 1 FROM drama_series s
        WHERE s.id = v.series_id AND s.publication_status = 'PUBLISHED'
          AND s.visibility = 'PUBLIC' AND s.deleted_at IS NULL))
ORDER BY v.published_at DESC, v.id DESC LIMIT 24;

\echo
\echo === Q6 creator dashboard, newest 20 ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, title, video_type, visibility, publication_status, processing_status, created_at FROM videos
WHERE creator_id = (SELECT id FROM seed_users WHERE n = 123) AND deleted_at IS NULL
ORDER BY created_at DESC, id DESC LIMIT 20;

\echo
\echo === Q6b creator dashboard, counts by publication_status ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT publication_status, count(*), sum(view_count) FROM videos
WHERE creator_id = (SELECT id FROM seed_users WHERE n = 123) AND deleted_at IS NULL
GROUP BY publication_status;

\echo
\echo === Q7 episodes of a season ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, episode_number FROM videos
WHERE season_id = (SELECT id FROM drama_seasons ORDER BY id LIMIT 1) AND deleted_at IS NULL
ORDER BY episode_number;

\echo
\echo === Q8 watch page lookup by slug ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT * FROM videos WHERE slug = 'video-123456';

\echo
\echo === Q9 worker poll: next runnable job ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id FROM processing_jobs WHERE status = 'PENDING' AND run_after <= now()
ORDER BY run_after, id LIMIT 1 FOR UPDATE SKIP LOCKED;

\echo
\echo === Q10 analytics: views of one video, last 7 days ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT date_trunc('day', occurred_at) AS day, count(*) FROM video_view_events
WHERE video_id = (SELECT video_id FROM video_view_events ORDER BY id LIMIT 1)
  AND occurred_at >= now() - interval '7 days'
GROUP BY 1 ORDER BY 1;

\echo
\echo === Q11 retention purge: one batch of events older than 85 days ===
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id FROM video_view_events WHERE occurred_at < now() - interval '85 days' LIMIT 10000;

\echo
\echo === Q2b by type when the type is rare (TEASER cut to about 1 percent of rows) ===
UPDATE videos SET video_type = 'MOVIE' WHERE video_type = 'TEASER' AND (abs(hashtext(id::text)) % 25) <> 0;
ANALYZE videos;
\echo --- with ix_videos_public_type_recent (as migrated)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, published_at FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL AND video_type = 'TEASER'
ORDER BY published_at DESC, id DESC LIMIT 24;
\echo --- same query with the index dropped (rolled back afterwards)
BEGIN;
DROP INDEX ix_videos_public_type_recent;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF, SUMMARY ON)
SELECT id, slug, title, published_at FROM videos
WHERE publication_status = 'PUBLISHED' AND visibility = 'PUBLIC' AND deleted_at IS NULL AND video_type = 'TEASER'
ORDER BY published_at DESC, id DESC LIMIT 24;
ROLLBACK;

-- ---------------------------------------------------------------- index sizes and usage
\echo
\echo === Index sizes ===
SELECT s.indexrelname AS index, pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_user_indexes s
WHERE s.indexrelname LIKE 'ix\_%' OR s.indexrelname LIKE 'uq\_%'
ORDER BY pg_relation_size(s.indexrelid) DESC;
