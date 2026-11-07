--liquibase formatted sql

--changeset aidrama:0009-soft-delete-guards splitStatements:false dbms:postgresql
-- Database-level guards so soft deletes cannot orphan episodes (spec 6.6). Raises SQLSTATE 23503
-- (foreign_key_violation), which the backend should map to HTTP 409.
--
-- 1. A series cannot be soft-deleted while it has live seasons or live videos.
-- 2. A season cannot be soft-deleted while it has live videos.
-- 3. A live video cannot be attached to a soft-deleted series or season.
--
-- Rule 3 takes FOR SHARE on the parent row. A concurrent soft delete of that parent must update the row,
-- so the two operations serialize and one of them fails. The backend deletes children first, then parents,
-- in a single short transaction.

CREATE FUNCTION guard_series_soft_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM drama_seasons WHERE series_id = OLD.id AND deleted_at IS NULL)
       OR EXISTS (SELECT 1 FROM videos WHERE series_id = OLD.id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'cannot soft-delete series %: live seasons or videos remain', OLD.id
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END
$$;

CREATE FUNCTION guard_season_soft_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM videos WHERE season_id = OLD.id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'cannot soft-delete season %: live videos remain', OLD.id
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END
$$;

CREATE FUNCTION guard_video_parent_live() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.series_id IS NOT NULL THEN
        PERFORM 1 FROM drama_series WHERE id = NEW.series_id AND deleted_at IS NULL FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'series % is deleted or does not exist', NEW.series_id USING ERRCODE = '23503';
        END IF;
    END IF;
    IF NEW.season_id IS NOT NULL THEN
        PERFORM 1 FROM drama_seasons WHERE id = NEW.season_id AND deleted_at IS NULL FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'season % is deleted or does not exist', NEW.season_id USING ERRCODE = '23503';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_drama_series_guard_soft_delete
    BEFORE UPDATE OF deleted_at ON drama_series
    FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION guard_series_soft_delete();

CREATE TRIGGER trg_drama_seasons_guard_soft_delete
    BEFORE UPDATE OF deleted_at ON drama_seasons
    FOR EACH ROW WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
    EXECUTE FUNCTION guard_season_soft_delete();

CREATE TRIGGER trg_videos_guard_parent_live
    BEFORE INSERT OR UPDATE OF series_id, season_id, deleted_at ON videos
    FOR EACH ROW WHEN (NEW.deleted_at IS NULL)
    EXECUTE FUNCTION guard_video_parent_live();

--rollback DROP TRIGGER trg_videos_guard_parent_live ON videos;
--rollback DROP TRIGGER trg_drama_seasons_guard_soft_delete ON drama_seasons;
--rollback DROP TRIGGER trg_drama_series_guard_soft_delete ON drama_series;
--rollback DROP FUNCTION guard_video_parent_live();
--rollback DROP FUNCTION guard_season_soft_delete();
--rollback DROP FUNCTION guard_series_soft_delete();
