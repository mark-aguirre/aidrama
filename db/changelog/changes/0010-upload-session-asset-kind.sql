--liquibase formatted sql

--changeset aidrama:0010-upload-session-asset-kind dbms:postgresql
-- An upload session now carries the kind of asset it delivers. VIDEO is the original source file
-- that is transcoded; THUMBNAIL is a creator-supplied poster image recorded directly as a
-- THUMBNAIL video asset with no processing job. Defaulting to VIDEO keeps every existing row and
-- the original video-only workflow unchanged.

ALTER TABLE upload_sessions
    ADD COLUMN asset_kind varchar(20) NOT NULL DEFAULT 'VIDEO';

ALTER TABLE upload_sessions
    ADD CONSTRAINT ck_upload_sessions_asset_kind CHECK (asset_kind IN ('VIDEO', 'THUMBNAIL'));

--rollback ALTER TABLE upload_sessions DROP CONSTRAINT ck_upload_sessions_asset_kind;
--rollback ALTER TABLE upload_sessions DROP COLUMN asset_kind;
