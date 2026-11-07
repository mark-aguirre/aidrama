--liquibase formatted sql

--changeset aidrama:0011-trailer-link splitStatements:false dbms:postgresql
-- A title (MOVIE, SHORT, EPISODE, ...) can point at one TRAILER video that backs its "Watch trailer" button.
-- The link lives on the parent: videos.trailer_video_id -> videos.id (self reference). Additive only. Existing rows get NULL.
--
-- Rules and the error each one raises (the backend can map on SQLSTATE plus constraint name, PSQLException.getServerErrorMessage().getConstraint()):
--   1. Link must point at an existing video of the same creator.   23503 fk_videos_trailer_video (composite FK, same pattern as fk_videos_series)
--   2. Link target must have video_type = 'TRAILER'.                23514 ck_videos_trailer_must_be_trailer (trigger, FKs cannot check the referenced row)
--   3. A video cannot be its own trailer.                           23514 ck_videos_trailer_not_self (trigger first, CHECK as backstop)
--   4. A TRAILER cannot carry a trailer_video_id (no nesting).      23514 ck_videos_trailer_no_nesting (CHECK)
--   5. One trailer backs at most one parent.                        23505 uq_videos_trailer_video (partial unique index, also serves lookups)
--   6. A new link cannot point at a soft-deleted trailer.           23503 fk_videos_trailer_live (trigger)
--   7. A linked trailer cannot be re-typed away from TRAILER.       23514 ck_videos_trailer_must_be_trailer (trigger on the trailer row)
--
-- Hard delete of a trailer row sets the parent's trailer_video_id to NULL (ON DELETE SET NULL on that column only).
--
-- Soft delete: the link is validated only when it is created or changed. Soft-deleting a linked trailer does NOT fail and does NOT
-- clear the link, so later saves of the parent keep working. Treat a soft-deleted trailer as "no trailer": the backend must resolve
-- the trailer with deleted_at IS NULL (and publication/processing state READY or PUBLISHED). To replace a trailer, UPDATE the parent
-- to the new trailer id. When the backend soft-deletes a parent it should also set trailer_video_id = NULL, otherwise the old trailer
-- stays reserved by uq_videos_trailer_video and cannot be linked to another title.
--
-- Locking: the link trigger takes FOR SHARE on the trailer row, so a concurrent re-typing or hard delete of that row serializes with the link.
-- ADD CONSTRAINT scans the table once under a brief exclusive lock. The new column is all NULL, so each scan is cheap now, but
-- re-evaluate (NOT VALID then VALIDATE in a later changeset) if videos becomes large before another change like this.
-- lock_timeout makes the migration fail fast instead of queueing behind a long transaction and blocking every query on videos.

SET LOCAL lock_timeout = '10s';

ALTER TABLE videos ADD COLUMN trailer_video_id uuid;

-- (trailer_video_id, creator_id) reuses uq_videos_id_creator, so a title can only link a trailer owned by the same creator.
-- SET NULL lists only trailer_video_id because creator_id is NOT NULL (PostgreSQL 15 feature, same as fk_videos_thumbnail_asset).
ALTER TABLE videos ADD CONSTRAINT fk_videos_trailer_video
    FOREIGN KEY (trailer_video_id, creator_id) REFERENCES videos (id, creator_id)
    ON DELETE SET NULL (trailer_video_id);

ALTER TABLE videos ADD CONSTRAINT ck_videos_trailer_not_self
    CHECK (trailer_video_id IS NULL OR trailer_video_id <> id);

ALTER TABLE videos ADD CONSTRAINT ck_videos_trailer_no_nesting
    CHECK (video_type <> 'TRAILER' OR trailer_video_id IS NULL);

-- One trailer per title, and a trailer backs at most one title. Also the lookup index for the parent of a trailer and the
-- referencing-side index for the FK, so no second index on the same column is needed.
CREATE UNIQUE INDEX uq_videos_trailer_video ON videos (trailer_video_id)
    WHERE trailer_video_id IS NOT NULL;

-- Runs when a link is created or changed. Re-saving an unchanged link is a no-op, so a parent whose trailer was soft-deleted
-- later can still be updated. A missing target is left to fk_videos_trailer_video (23503).
CREATE FUNCTION check_video_trailer_link() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    target_type    text;
    target_deleted timestamptz;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.trailer_video_id IS NOT DISTINCT FROM OLD.trailer_video_id THEN
        RETURN NEW;
    END IF;

    IF NEW.trailer_video_id = NEW.id THEN
        RAISE EXCEPTION 'video % cannot be its own trailer', NEW.id
            USING ERRCODE = '23514', CONSTRAINT = 'ck_videos_trailer_not_self';
    END IF;

    SELECT video_type, deleted_at INTO target_type, target_deleted
    FROM videos WHERE id = NEW.trailer_video_id FOR SHARE;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF target_type <> 'TRAILER' THEN
        RAISE EXCEPTION 'video % has type % and cannot be linked as a trailer', NEW.trailer_video_id, target_type
            USING ERRCODE = '23514', CONSTRAINT = 'ck_videos_trailer_must_be_trailer';
    END IF;
    IF target_deleted IS NOT NULL THEN
        RAISE EXCEPTION 'trailer video % is deleted and cannot be linked', NEW.trailer_video_id
            USING ERRCODE = '23503', CONSTRAINT = 'fk_videos_trailer_live';
    END IF;
    RETURN NEW;
END
$$;

-- The other half of rule 2: a video that is the trailer of another cannot stop being a TRAILER.
-- Looks at every row that links to it, soft-deleted parents included, so the stored data always satisfies rule 2.
CREATE FUNCTION guard_trailer_video_type() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM videos WHERE trailer_video_id = OLD.id) THEN
        RAISE EXCEPTION 'video % is linked as a trailer and must stay type TRAILER', OLD.id
            USING ERRCODE = '23514', CONSTRAINT = 'ck_videos_trailer_must_be_trailer';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_videos_check_trailer_link
    BEFORE INSERT OR UPDATE OF trailer_video_id ON videos
    FOR EACH ROW WHEN (NEW.trailer_video_id IS NOT NULL)
    EXECUTE FUNCTION check_video_trailer_link();

CREATE TRIGGER trg_videos_guard_trailer_type
    BEFORE UPDATE OF video_type ON videos
    FOR EACH ROW WHEN (OLD.video_type = 'TRAILER' AND NEW.video_type <> 'TRAILER')
    EXECUTE FUNCTION guard_trailer_video_type();

--rollback SET LOCAL lock_timeout = '10s';
--rollback DROP TRIGGER trg_videos_guard_trailer_type ON videos;
--rollback DROP TRIGGER trg_videos_check_trailer_link ON videos;
--rollback DROP FUNCTION guard_trailer_video_type();
--rollback DROP FUNCTION check_video_trailer_link();
--rollback DROP INDEX uq_videos_trailer_video;
--rollback ALTER TABLE videos DROP CONSTRAINT ck_videos_trailer_no_nesting;
--rollback ALTER TABLE videos DROP CONSTRAINT ck_videos_trailer_not_self;
--rollback ALTER TABLE videos DROP CONSTRAINT fk_videos_trailer_video;
--rollback ALTER TABLE videos DROP COLUMN trailer_video_id;
