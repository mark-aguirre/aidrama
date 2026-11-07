--liquibase formatted sql

--changeset aidrama:0005-video-assets dbms:postgresql
-- Media files for a video: the original upload, the HLS master playlist, HLS renditions, thumbnails.
-- Public URLs are not stored. The backend builds them from storage_bucket and storage_key.
-- video_id uses RESTRICT, not CASCADE. A purge job must read storage keys and delete objects first.
-- videos.thumbnail_asset_id points at (asset id, video id), so a video can only use its own asset.
-- ON DELETE SET NULL with a column list nulls only thumbnail_asset_id (PostgreSQL 15+).

CREATE TABLE video_assets (
    id                uuid          NOT NULL DEFAULT gen_random_uuid(),
    video_id          uuid          NOT NULL,
    asset_type        varchar(20)   NOT NULL,
    processing_status varchar(20)   NOT NULL DEFAULT 'PENDING',
    storage_bucket    varchar(63)   NOT NULL,
    storage_key       varchar(1024) NOT NULL,
    mime_type         varchar(100),
    size_bytes        bigint,
    width_px          integer,
    height_px         integer,
    bitrate_kbps      integer,
    rendition_label   varchar(20),
    checksum_sha256   char(64),
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT pk_video_assets PRIMARY KEY (id),
    CONSTRAINT uq_video_assets_id_video UNIQUE (id, video_id),
    CONSTRAINT uq_video_assets_storage_object UNIQUE (storage_bucket, storage_key),
    CONSTRAINT fk_video_assets_video FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE RESTRICT,
    CONSTRAINT ck_video_assets_asset_type CHECK (asset_type IN ('ORIGINAL', 'HLS_MASTER', 'HLS_RENDITION', 'THUMBNAIL')),
    CONSTRAINT ck_video_assets_processing_status CHECK (processing_status IN
        ('PENDING', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT ck_video_assets_size CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT ck_video_assets_dimensions CHECK (
        (width_px IS NULL OR width_px > 0) AND (height_px IS NULL OR height_px > 0)
        AND (bitrate_kbps IS NULL OR bitrate_kbps > 0)),
    CONSTRAINT ck_video_assets_checksum CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE TRIGGER trg_video_assets_set_updated_at BEFORE UPDATE ON video_assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- At most one original and one HLS master per video.
CREATE UNIQUE INDEX uq_video_assets_one_original ON video_assets (video_id) WHERE asset_type = 'ORIGINAL';
CREATE UNIQUE INDEX uq_video_assets_one_hls_master ON video_assets (video_id) WHERE asset_type = 'HLS_MASTER';
-- Lookup of a video's assets by type (renditions, thumbnails).
CREATE INDEX ix_video_assets_video_type ON video_assets (video_id, asset_type);

ALTER TABLE videos ADD CONSTRAINT fk_videos_thumbnail_asset
    FOREIGN KEY (thumbnail_asset_id, id) REFERENCES video_assets (id, video_id)
    ON DELETE SET NULL (thumbnail_asset_id);

-- Supports the foreign key check when an asset row is deleted.
CREATE INDEX ix_videos_thumbnail_asset ON videos (thumbnail_asset_id) WHERE thumbnail_asset_id IS NOT NULL;

--rollback DROP INDEX ix_videos_thumbnail_asset;
--rollback ALTER TABLE videos DROP CONSTRAINT fk_videos_thumbnail_asset;
--rollback DROP TABLE video_assets;
