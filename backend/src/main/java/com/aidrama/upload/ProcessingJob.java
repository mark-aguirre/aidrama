package com.aidrama.upload;

import com.aidrama.common.persistence.TimestampedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Table {@code processing_jobs}. One active (PENDING or PROCESSING) job per video is enforced by
 * a partial unique index. The state methods encode the CHECK constraints: PROCESSING needs
 * started_at, READY and FAILED need finished_at, FAILED needs a code and message.
 */
@Entity
@Table(name = "processing_jobs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ProcessingJob extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "video_id", nullable = false)
    private UUID videoId;

    @Column(name = "source_asset_id", nullable = false)
    private UUID sourceAssetId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private JobStatus status;

    @Column(name = "progress_percent", nullable = false)
    private short progressPercent;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Column(name = "max_attempts", nullable = false)
    private int maxAttempts;

    @Column(name = "run_after", nullable = false)
    private Instant runAfter;

    @Column(name = "worker_id", length = 100)
    private String workerId;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "heartbeat_at")
    private Instant heartbeatAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "failure_code", length = 50)
    private String failureCode;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public static ProcessingJob queue(UUID videoId, UUID sourceAssetId, Instant now) {
        ProcessingJob j = new ProcessingJob();
        j.id = UUID.randomUUID();
        j.videoId = videoId;
        j.sourceAssetId = sourceAssetId;
        j.status = JobStatus.PENDING;
        j.progressPercent = 0;
        j.attemptCount = 0;
        j.maxAttempts = 3;
        j.runAfter = now;
        return j;
    }

    public void start(String workerId, Instant now) {
        status = JobStatus.PROCESSING;
        this.workerId = workerId;
        attemptCount++;
        startedAt = now;
        heartbeatAt = now;
    }

    public void reportProgress(int percent, Instant now) {
        progressPercent = (short) Math.max(0, Math.min(100, percent));
        heartbeatAt = now;
    }

    public void succeed(Instant now) {
        status = JobStatus.READY;
        progressPercent = 100;
        finishedAt = now;
        heartbeatAt = now;
    }

    public void fail(String code, String message, Instant now) {
        status = JobStatus.FAILED;
        failureCode = code;
        failureMessage = message;
        finishedAt = now;
    }
}
