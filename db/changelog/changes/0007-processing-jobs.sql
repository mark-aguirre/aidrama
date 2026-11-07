--liquibase formatted sql

--changeset aidrama:0007-processing-jobs dbms:postgresql
-- Durable record of a transcoding job. Redis is the queue and this table is the system of record.
-- Job status reuses the processing vocabulary: PENDING, PROCESSING, READY (succeeded), FAILED.
-- Workers claim a job with: UPDATE ... SET status = 'PROCESSING' WHERE id = ? AND status = 'PENDING'.
-- run_after allows retry with backoff. heartbeat_at lets a reaper requeue jobs from dead workers.
-- source_asset_id is constrained to an asset of the same video.

CREATE TABLE processing_jobs (
    id               uuid          NOT NULL DEFAULT gen_random_uuid(),
    video_id         uuid          NOT NULL,
    source_asset_id  uuid          NOT NULL,
    status           varchar(20)   NOT NULL DEFAULT 'PENDING',
    progress_percent smallint      NOT NULL DEFAULT 0,
    attempt_count    integer       NOT NULL DEFAULT 0,
    max_attempts     integer       NOT NULL DEFAULT 3,
    run_after        timestamptz   NOT NULL DEFAULT now(),
    worker_id        varchar(100),
    started_at       timestamptz,
    heartbeat_at     timestamptz,
    finished_at      timestamptz,
    failure_code     varchar(50),
    failure_message  varchar(1000),
    version          bigint        NOT NULL DEFAULT 0,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT pk_processing_jobs PRIMARY KEY (id),
    CONSTRAINT fk_processing_jobs_video FOREIGN KEY (video_id) REFERENCES videos (id) ON DELETE RESTRICT,
    CONSTRAINT fk_processing_jobs_source_asset FOREIGN KEY (source_asset_id, video_id)
        REFERENCES video_assets (id, video_id) ON DELETE RESTRICT,
    CONSTRAINT ck_processing_jobs_status CHECK (status IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT ck_processing_jobs_progress CHECK (progress_percent BETWEEN 0 AND 100),
    CONSTRAINT ck_processing_jobs_attempts CHECK (attempt_count >= 0 AND max_attempts > 0),
    CONSTRAINT ck_processing_jobs_processing_has_start CHECK (status <> 'PROCESSING' OR started_at IS NOT NULL),
    CONSTRAINT ck_processing_jobs_finished_has_timestamp CHECK (status NOT IN ('READY', 'FAILED') OR finished_at IS NOT NULL),
    CONSTRAINT ck_processing_jobs_failed_has_reason CHECK (
        status <> 'FAILED' OR (failure_code IS NOT NULL AND failure_message IS NOT NULL))
);

CREATE TRIGGER trg_processing_jobs_set_updated_at BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Jobs of one video, newest first. Also supports the foreign key.
CREATE INDEX ix_processing_jobs_video_recent ON processing_jobs (video_id, created_at DESC);
-- Only one queued or running job per video (blocks double enqueue).
CREATE UNIQUE INDEX uq_processing_jobs_one_active_per_video ON processing_jobs (video_id)
    WHERE status IN ('PENDING', 'PROCESSING');
-- Worker polling for runnable jobs.
CREATE INDEX ix_processing_jobs_runnable ON processing_jobs (run_after, id) WHERE status = 'PENDING';
-- Reaper scan for stalled jobs.
CREATE INDEX ix_processing_jobs_stalled ON processing_jobs (heartbeat_at) WHERE status = 'PROCESSING';

--rollback DROP TABLE processing_jobs;
