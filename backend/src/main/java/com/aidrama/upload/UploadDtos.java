package com.aidrama.upload;

import com.aidrama.video.ProcessingStatus;
import com.aidrama.video.PublicationStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Request and response bodies of the upload endpoints (spec 7.5). */
public final class UploadDtos {

    private UploadDtos() {}

    public record InitiateUploadRequest(
            @NotNull UUID videoId,
            @NotBlank @Size(max = 255) String filename,
            @NotBlank @Size(max = 100) String contentType,
            @NotNull @Positive Long sizeBytes,
            AssetKind assetKind) {

        /** Older clients that send no {@code assetKind} mean the original video file. */
        public AssetKind assetKindOrDefault() {
            return assetKind == null ? AssetKind.VIDEO : assetKind;
        }
    }

    /** Where and how the browser uploads. Present only while the session is in flight and not expired. */
    public record UploadTarget(String url, String method, Map<String, String> headers) {}

    /** One presigned part PUT of a multipart upload: its 1-based number and signed URL. */
    public record UploadPartTarget(int partNumber, String url) {}

    /**
     * A chunked (S3 multipart) upload plan. Present instead of {@code upload} when the file is large
     * enough to exceed a single request's body limit. The browser PUTs each slice of {@code partSizeBytes}
     * to its {@code parts[i].url} (the last part is the remainder), collects the {@code ETag} response
     * header of each, and sends them to {@code POST /uploads/{id}/complete-multipart}.
     */
    public record UploadMultipart(long partSizeBytes, int totalParts, List<UploadPartTarget> parts) {}

    /** One finished part the client reports on complete: its 1-based number and the storage ETag. */
    public record CompletedPart(@NotNull @Positive Integer partNumber, @NotBlank String eTag) {}

    /** Body of {@code POST /uploads/{id}/complete-multipart}: every part's number and ETag, any order. */
    public record CompleteMultipartRequest(@NotEmpty List<@Valid CompletedPart> parts) {}

    public record Failure(String code, String message) {}

    public record UploadSessionResponse(
            UUID id,
            UUID videoId,
            UploadStatus status,
            AssetKind assetKind,
            String filename,
            String contentType,
            long sizeBytes,
            long uploadedBytes,
            UploadTarget upload,
            UploadMultipart multipart,
            Instant expiresAt,
            Instant completedAt,
            Failure failure,
            Instant createdAt) {}

    /**
     * Processing state of a video. {@code jobStatus} and {@code progressPercent} come from the latest
     * processing job; {@code failure} explains the last upload or processing failure.
     */
    public record ProcessingStatusResponse(
            UUID videoId,
            ProcessingStatus processingStatus,
            PublicationStatus publicationStatus,
            JobStatus jobStatus,
            int progressPercent,
            Failure failure,
            Instant updatedAt) {}

    public record UploadCompleteResponse(UploadSessionResponse upload, ProcessingStatusResponse processing) {}
}
