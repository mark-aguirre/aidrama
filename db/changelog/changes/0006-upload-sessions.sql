--liquibase formatted sql

--changeset aidrama:0006-upload-sessions dbms:postgresql
-- One multipart upload attempt for a video. A video may have several sessions over time (retry, history).
-- The composite foreign key (video_id, creator_id) guarantees the uploader owns the video.
-- Upload session status is its own lifecycle and is not the same set as videos.processing_status.
-- idempotency_key lets the client retry "create session" without creating a duplicate.

CREATE TABLE upload_sessions (
    id                  uuid          NOT NULL DEFAULT gen_random_uuid(),
    creator_id          uuid          NOT NULL,
    video_id            uuid          NOT NULL,
    status              varchar(20)   NOT NULL DEFAULT 'PENDING',
    original_filename   varchar(255)  NOT NULL,
    content_type        varchar(100)  NOT NULL,
    declared_size_bytes bigint        NOT NULL,
    uploaded_bytes      bigint        NOT NULL DEFAULT 0,
    storage_bucket      varchar(63)   NOT NULL,
    storage_key         varchar(1024) NOT NULL,
    multipart_upload_id varchar(1024),
    part_size_bytes     bigint,
    total_parts         integer,
    completed_parts     integer       NOT NULL DEFAULT 0,
    idempotency_key     varchar(64),
    failure_code        varchar(50),
    failure_message     varchar(1000),
    expires_at          timestamptz   NOT NULL,
    completed_at        timestamptz,
    version             bigint        NOT NULL DEFAULT 0,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT pk_upload_sessions PRIMARY KEY (id),
    CONSTRAINT uq_upload_sessions_storage_object UNIQUE (storage_bucket, storage_key),
    CONSTRAINT fk_upload_sessions_video_owner FOREIGN KEY (video_id, creator_id)
        REFERENCES videos (id, creator_id) ON DELETE RESTRICT,
    CONSTRAINT ck_upload_sessions_status CHECK (status IN
        ('PENDING', 'UPLOADING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED')),
    CONSTRAINT ck_upload_sessions_size CHECK (declared_size_bytes > 0),
    CONSTRAINT ck_upload_sessions_progress CHECK (uploaded_bytes >= 0 AND uploaded_bytes <= declared_size_bytes),
    CONSTRAINT ck_upload_sessions_parts CHECK (
        completed_parts >= 0 AND (total_parts IS NULL OR (total_parts > 0 AND completed_parts <= total_parts))),
    CONSTRAINT ck_upload_sessions_failed_has_reason CHECK (
        status <> 'FAILED' OR (failure_code IS NOT NULL AND failure_message IS NOT NULL)),
    CONSTRAINT ck_upload_sessions_completed_has_timestamp CHECK (status <> 'COMPLETED' OR completed_at IS NOT NULL)
);

CREATE TRIGGER trg_upload_sessions_set_updated_at BEFORE UPDATE ON upload_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Upload history for the creator dashboard.
CREATE INDEX ix_upload_sessions_creator_recent ON upload_sessions (creator_id, created_at DESC, id DESC);
-- Sessions of one video (retry and history). Also supports the foreign key.
CREATE INDEX ix_upload_sessions_video_recent ON upload_sessions (video_id, created_at DESC);
-- Only one in-flight upload per video.
CREATE UNIQUE INDEX uq_upload_sessions_one_active_per_video ON upload_sessions (video_id)
    WHERE status IN ('PENDING', 'UPLOADING');
-- Idempotent session creation per creator.
CREATE UNIQUE INDEX uq_upload_sessions_idempotency ON upload_sessions (creator_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
-- Cleanup job: find in-flight sessions past their expiry.
CREATE INDEX ix_upload_sessions_expiry ON upload_sessions (expires_at)
    WHERE status IN ('PENDING', 'UPLOADING');

--rollback DROP TABLE upload_sessions;
