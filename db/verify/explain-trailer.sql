-- Query-plan review for the trailer link (0011). Throwaway database only. Synthetic data, rolled back at the end.
-- Run with: psql -v ON_ERROR_STOP=1 -f explain-trailer.sql   (verify.ps1 -Explain does this)
\set ON_ERROR_STOP on
\timing off
BEGIN;

INSERT INTO users (id, email, username, password_hash)
VALUES ('abababab-0000-4000-8000-000000000001', 'trailer-plan@example.test', 'trailerplan', 'x');

-- 300,000 videos for one creator: every third is a TRAILER, the rest MOVIE.
INSERT INTO videos (id, creator_id, video_type, title, slug, is_ai_generated, publication_status, processing_status, published_at, genre)
SELECT gen_random_uuid(), 'abababab-0000-4000-8000-000000000001',
       CASE WHEN g % 3 = 0 THEN 'TRAILER' ELSE 'MOVIE' END, 'tp ' || g, 'tp-' || g, true, 'PUBLISHED', 'READY', now(), 'Drama'
FROM generate_series(1, 300000) g;

-- Link 60,000 movies to 60,000 distinct trailers (the unique index and triggers are active during this update).
CREATE TEMP TABLE pair AS
SELECT m.id AS parent_id, t.id AS trailer_id
FROM (SELECT id, row_number() OVER () rn FROM videos WHERE slug LIKE 'tp-%' AND video_type = 'MOVIE'   LIMIT 60000) m
JOIN (SELECT id, row_number() OVER () rn FROM videos WHERE slug LIKE 'tp-%' AND video_type = 'TRAILER' LIMIT 60000) t USING (rn);
UPDATE videos v SET trailer_video_id = p.trailer_id FROM pair p WHERE v.id = p.parent_id;
ANALYZE videos;

SELECT count(*) AS linked_parents FROM videos WHERE trailer_video_id IS NOT NULL;
SELECT pg_size_pretty(pg_relation_size('uq_videos_trailer_video')) AS trailer_index_size,
       pg_size_pretty(pg_relation_size('pk_videos'))               AS pk_index_size;

SELECT parent_id AS p, trailer_id AS t FROM pair LIMIT 1 \gset

\echo ==== A. Resolve the trailer of a parent (watch page "Watch trailer")
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT t.id, t.slug, t.duration_seconds
FROM videos p
JOIN videos t ON t.id = p.trailer_video_id AND t.deleted_at IS NULL AND t.publication_status IN ('READY', 'PUBLISHED')
WHERE p.id = :'p';

\echo ==== B. Which parent does this trailer back (reverse lookup)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id FROM videos WHERE trailer_video_id = :'t';

\echo ==== C. Hard delete of a linked trailer (FK ON DELETE SET NULL path)
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
DELETE FROM videos WHERE id = :'t';

\echo ==== D. Write cost: link one parent to a fresh trailer (link trigger + FK check + unique index)
INSERT INTO videos (id, creator_id, video_type, title, slug, is_ai_generated)
VALUES ('abababab-0000-4000-8000-0000000000f1', 'abababab-0000-4000-8000-000000000001', 'TRAILER', 'extra trailer', 'tp-extra-trailer', true),
       ('abababab-0000-4000-8000-0000000000f2', 'abababab-0000-4000-8000-000000000001', 'MOVIE',   'extra parent',  'tp-extra-parent',  true);
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
UPDATE videos SET trailer_video_id = 'abababab-0000-4000-8000-0000000000f1'
WHERE id = 'abababab-0000-4000-8000-0000000000f2';

ROLLBACK;
