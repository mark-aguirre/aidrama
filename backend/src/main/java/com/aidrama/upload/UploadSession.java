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
 * Table {@code upload_sessions}: one upload attempt for a video. The composite foreign key
 * (video_id, creator_id) guarantees the uploader owns the video; a partial unique index allows
 * only one in-flight (PENDING or UPLOADING) session per video.
 */
@Entity
@Table(name = "upload_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UploadSession extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "creator_id", nullable = false)
    private UUID creatorId;

    @Column(name = "video_id", nullable = false)
    private UUID videoId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private UploadStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "asset_kind", nullable = false, length = 20)
    private AssetKind assetKind;

    @Column(name = "original_filename", nullable = false, length = 255)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "declared_size_bytes", nullable = false)
    private long declaredSizeBytes;

    @Column(name = "uploaded_bytes", nullable = false)
    private long uploadedBytes;

    @Column(name = "storage_bucket", nullable = false, length = 63)
    private String storageBucket;

    @Column(name = "storage_key", nullable = false, length = 1024)
    private String storageKey;

    @Column(name = "multipart_upload_id", length = 1024)
    private String multipartUploadId;

    @Column(name = "part_size_bytes")
    private Long partSizeBytes;

    @Column(name = "total_parts")
    private Integer totalParts;

    @Column(name = "completed_parts", nullable = false)
    private int completedParts;

    @Column(name = "idempotency_key", length = 64)
    private String idempotencyKey;

    @Column(name = "failure_code", length = 50)
    private String failureCode;

    @Column(name = "failure_message", length = 1000)
    private String failureMessage;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    public static UploadSession start(
            UUID id,
            UUID creatorId,
            UUID videoId,
            AssetKind assetKind,
            String originalFilename,
            String contentType,
            long declaredSizeBytes,
            String bucket,
            String key,
            String idempotencyKey,
            Instant expiresAt) {
        UploadSession s = new UploadSession();
        s.id = id;
        s.creatorId = creatorId;
        s.videoId = videoId;
        s.status = UploadStatus.PENDING;
        s.assetKind = assetKind;
        s.originalFilename = originalFilename;
        s.contentType = contentType;
        s.declaredSizeBytes = declaredSizeBytes;
        s.storageBucket = bucket;
        s.storageKey = key;
        s.idempotencyKey = idempotencyKey;
        s.expiresAt = expiresAt;
        return s;
    }

    public boolean isInFlight() {
        return status == UploadStatus.PENDING || status == UploadStatus.UPLOADING;
    }

    public boolean isExpired(Instant now) {
        return !expiresAt.isAfter(now);
    }

    public void markCompleted(Instant now) {
        status = UploadStatus.COMPLETED;
        uploadedBytes = declaredSizeBytes;
        completedAt = now;
    }

    public void markFailed(String code, String message) {
        status = UploadStatus.FAILED;
        failureCode = code;
        failureMessage = message;
    }

    public void cancel() {
        status = UploadStatus.CANCELLED;
    }

    public void expire() {
        status = UploadStatus.EXPIRED;
    }
}
