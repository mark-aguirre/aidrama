package com.aidrama.upload;

import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.BusinessRuleException;
import com.aidrama.common.exception.ConflictException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.common.exception.PayloadTooLargeException;
import com.aidrama.config.AppProperties;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.storage.ObjectStorage;
import com.aidrama.storage.ObjectStorage.SignedUpload;
import com.aidrama.storage.ObjectStorage.StoredObject;
import com.aidrama.upload.UploadDtos.Failure;
import com.aidrama.upload.UploadDtos.InitiateUploadRequest;
import com.aidrama.upload.UploadDtos.UploadCompleteResponse;
import com.aidrama.upload.UploadDtos.UploadSessionResponse;
import com.aidrama.upload.UploadDtos.UploadTarget;
import com.aidrama.user.Role;
import com.aidrama.video.AssetType;
import com.aidrama.video.ProcessingStatus;
import com.aidrama.video.Video;
import com.aidrama.video.VideoAsset;
import com.aidrama.video.VideoAssetRepository;
import com.aidrama.video.VideoRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Direct-to-storage upload workflow (spec 5.3).
 *
 * <ol>
 *   <li>{@link #initiate}: validates ownership, type and size, stores a session and returns a
 *       presigned PUT target. The video bytes never pass through this API.
 *   <li>The browser PUTs the file to object storage.
 *   <li>{@link #complete}: verifies the stored object (exists, size and content type match), records
 *       the ORIGINAL asset, queues a processing job and moves the video to PROCESSING.
 * </ol>
 *
 * <p>Transactions are short and programmatic. The storage HEAD call in {@code complete} runs outside
 * any transaction. Every operation is scoped to the authenticated creator.
 */
@Service
public class UploadService {

    private static final Logger log = LoggerFactory.getLogger(UploadService.class);

    /** Allowed video formats (spec 3.7) with the one file extension each may carry. */
    private static final Map<String, String> EXTENSION_BY_CONTENT_TYPE =
            Map.of("video/mp4", "mp4", "video/quicktime", "mov", "video/webm", "webm");

    /** Allowed thumbnail image formats with the one file extension each may carry. */
    private static final Map<String, String> THUMBNAIL_EXTENSION_BY_CONTENT_TYPE =
            Map.of("image/jpeg", "jpg", "image/png", "png", "image/webp", "webp");

    /** A creator-supplied thumbnail is a small poster image, capped well below the video limit. */
    private static final long MAX_THUMBNAIL_BYTES = 5L * 1024 * 1024;

    /** A slow upload that started before the URL expired may still finish after it. */
    private static final Duration COMPLETION_GRACE = Duration.ofMinutes(10);

    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("^[A-Za-z0-9._:-]{8,64}$");

    private final UploadSessionRepository sessions;
    private final VideoRepository videos;
    private final VideoAssetRepository assets;
    private final ProcessingJobRepository jobs;
    private final ObjectStorage storage;
    private final ProcessingStatusService statusService;
    private final TransactionTemplate tx;
    private final AppProperties.Storage props;
    private final Clock clock;

    public UploadService(
            UploadSessionRepository sessions,
            VideoRepository videos,
            VideoAssetRepository assets,
            ProcessingJobRepository jobs,
            ObjectStorage storage,
            ProcessingStatusService statusService,
            TransactionTemplate tx,
            AppProperties props,
            Clock clock) {
        this.sessions = sessions;
        this.videos = videos;
        this.assets = assets;
        this.jobs = jobs;
        this.storage = storage;
        this.statusService = statusService;
        this.tx = tx;
        this.props = props.storage();
        this.clock = clock;
    }

    /** Result of {@link #initiate}. {@code created} is false when an idempotent replay returned an existing session. */
    public record InitiateResult(UploadSessionResponse session, boolean created) {}

    public InitiateResult initiate(AuthenticatedUser caller, InitiateUploadRequest request, String idempotencyKey) {
        caller.require(Role.CREATOR);
        AssetKind kind = request.assetKindOrDefault();
        String extension = validateFile(request, kind);
        String key = validateIdempotencyKey(idempotencyKey);

        if (key != null) {
            Optional<UploadSession> existing = sessions.findByCreatorIdAndIdempotencyKey(caller.id(), key);
            if (existing.isPresent()) {
                UploadSession s = existing.get();
                if (!sameRequest(s, request)) {
                    throw new ConflictException(
                            "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
                }
                return new InitiateResult(toResponse(s), false);
            }
        }

        Instant now = Instant.now(clock);
        UUID sessionId = UUID.randomUUID();
        String folder = kind == AssetKind.THUMBNAIL ? "thumbnail" : "original";
        String objectKey = "videos/" + request.videoId() + "/" + folder + "/" + sessionId + "." + extension;
        UploadSession created;
        try {
            created = tx.execute(status -> {
                Video video = ownedVideo(caller, request.videoId());
                expireStaleSessions(video, now);
                List<UploadSession> inFlight =
                        sessions.findByVideoIdAndStatusIn(video.getId(), List.of(UploadStatus.PENDING, UploadStatus.UPLOADING));
                if (!inFlight.isEmpty()) {
                    throw new ConflictException(
                            "UPLOAD_IN_PROGRESS",
                            "An upload is already in progress for this video. Cancel it or wait for it to expire.",
                            List.of(new FieldIssue("uploadId", inFlight.getFirst().getId().toString())));
                }
                // A thumbnail is recorded directly on complete and never enters the video's
                // transcoding lifecycle, so it must not move the video's processing status.
                if (kind == AssetKind.VIDEO) {
                    video.beginUpload();
                    videos.saveAndFlush(video);
                }
                return sessions.saveAndFlush(UploadSession.start(
                        sessionId,
                        caller.id(),
                        video.getId(),
                        kind,
                        sanitizeFilename(request.filename()),
                        request.contentType(),
                        request.sizeBytes(),
                        storage.bucket(),
                        objectKey,
                        key,
                        now.plus(props.uploadUrlTtl())));
            });
        } catch (DataIntegrityViolationException ex) {
            // Two requests raced past the checks; the partial unique indexes are the final guard.
            throw new ConflictException("UPLOAD_IN_PROGRESS", "An upload is already in progress for this video.");
        }
        log.info("Upload session created: uploadId={} videoId={} creatorId={}", created.getId(), created.getVideoId(), caller.id());
        return new InitiateResult(toResponse(created), true);
    }

    public UploadSessionResponse get(AuthenticatedUser caller, UUID uploadId) {
        caller.require(Role.CREATOR);
        return toResponse(ownedSession(caller, uploadId));
    }

    public UploadCompleteResponse complete(AuthenticatedUser caller, UUID uploadId) {
        caller.require(Role.CREATOR);
        UploadSession session = ownedSession(caller, uploadId);

        if (session.getStatus() == UploadStatus.COMPLETED) {
            return completion(caller, session);
        }
        if (!session.isInFlight()) {
            throw new ConflictException("UPLOAD_SESSION_NOT_ACTIVE", "This upload is " + session.getStatus() + " and cannot be completed.");
        }
        Instant now = Instant.now(clock);
        if (session.isExpired(now.minus(COMPLETION_GRACE))) {
            tx.executeWithoutResult(status -> abandon(session.getId(), caller, UploadStatus.EXPIRED));
            throw new ConflictException("UPLOAD_SESSION_EXPIRED", "This upload session expired. Start a new upload.");
        }

        // Remote call, deliberately outside a transaction.
        Optional<StoredObject> stored = storage.head(session.getStorageKey());
        if (stored.isEmpty()) {
            throw new BusinessRuleException(
                    "UPLOAD_OBJECT_MISSING", "The file was not found in storage. Finish uploading, then confirm again.");
        }
        StoredObject object = stored.get();
        if (object.sizeBytes() != session.getDeclaredSizeBytes() || !sameContentType(object.contentType(), session.getContentType())) {
            tx.executeWithoutResult(status -> failVerification(session.getId(), caller));
            throw new BusinessRuleException(
                    "UPLOAD_VERIFICATION_FAILED",
                    "The uploaded file does not match what was declared. Start a new upload.");
        }

        try {
            tx.executeWithoutResult(status -> finish(session.getId(), caller, now));
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException("PROCESSING_ALREADY_QUEUED", "Processing is already queued for this video.");
        }
        log.info("Upload completed, processing queued: uploadId={} videoId={}", session.getId(), session.getVideoId());
        return completion(caller, ownedSession(caller, uploadId));
    }

    public UploadSessionResponse cancel(AuthenticatedUser caller, UUID uploadId) {
        caller.require(Role.CREATOR);
        UploadSession session = ownedSession(caller, uploadId);
        if (session.getStatus() == UploadStatus.COMPLETED) {
            throw new ConflictException("UPLOAD_ALREADY_COMPLETED", "This upload is already completed and cannot be cancelled.");
        }
        if (session.isInFlight()) {
            tx.executeWithoutResult(status -> abandon(session.getId(), caller, UploadStatus.CANCELLED));
        }
        return toResponse(ownedSession(caller, uploadId));
    }

    // ---- transactional steps ----

    private void abandon(UUID sessionId, AuthenticatedUser caller, UploadStatus target) {
        UploadSession s = sessions.findByIdAndCreatorId(sessionId, caller.id()).orElseThrow(() -> new NotFoundException("Upload"));
        if (!s.isInFlight()) {
            return;
        }
        if (target == UploadStatus.CANCELLED) {
            s.cancel();
        } else {
            s.expire();
        }
        sessions.saveAndFlush(s);
        // A thumbnail session never changed the video's processing status, so there is nothing to undo.
        if (s.getAssetKind() == AssetKind.VIDEO) {
            Video video = ownedVideo(caller, s.getVideoId());
            video.uploadAbandoned();
            videos.saveAndFlush(video);
        }
    }

    private void failVerification(UUID sessionId, AuthenticatedUser caller) {
        UploadSession s = sessions.findByIdAndCreatorId(sessionId, caller.id()).orElseThrow(() -> new NotFoundException("Upload"));
        if (!s.isInFlight()) {
            return;
        }
        s.markFailed("UPLOAD_VERIFICATION_FAILED", "The uploaded file's size or type did not match what was declared.");
        sessions.saveAndFlush(s);
        // A failed thumbnail upload leaves the video's processing lifecycle untouched.
        if (s.getAssetKind() == AssetKind.VIDEO) {
            Video video = ownedVideo(caller, s.getVideoId());
            video.uploadFailed();
            videos.saveAndFlush(video);
        }
    }

    private void finish(UUID sessionId, AuthenticatedUser caller, Instant now) {
        UploadSession s = sessions.findByIdAndCreatorId(sessionId, caller.id()).orElseThrow(() -> new NotFoundException("Upload"));
        if (!s.isInFlight()) {
            // Lost a race with a concurrent complete or cancel. Do not queue a second job.
            throw new ConflictException("UPLOAD_SESSION_NOT_ACTIVE", "This upload is " + s.getStatus() + " and cannot be completed.");
        }
        Video video = ownedVideo(caller, s.getVideoId());
        if (s.getAssetKind() == AssetKind.THUMBNAIL) {
            finishThumbnail(s, video, now);
            return;
        }
        VideoAsset original = assets.findByVideoIdAndAssetType(video.getId(), AssetType.ORIGINAL)
                .map(a -> {
                    a.replaceObject(s.getStorageBucket(), s.getStorageKey(), s.getContentType(), s.getDeclaredSizeBytes(), ProcessingStatus.READY);
                    return a;
                })
                .orElseGet(() -> VideoAsset.create(
                        video.getId(), AssetType.ORIGINAL, ProcessingStatus.READY,
                        s.getStorageBucket(), s.getStorageKey(), s.getContentType(), s.getDeclaredSizeBytes()));
        original = assets.saveAndFlush(original);

        s.markCompleted(now);
        sessions.saveAndFlush(s);
        video.processingQueued();
        videos.saveAndFlush(video);
        jobs.saveAndFlush(ProcessingJob.queue(video.getId(), original.getId(), now));
    }

    /**
     * Records a creator-supplied thumbnail: replaces any existing THUMBNAIL asset, points the video
     * at it so {@code thumbnailUrl} resolves at once, and leaves the processing lifecycle untouched.
     */
    private void finishThumbnail(UploadSession s, Video video, Instant now) {
        VideoAsset thumbnail = assets.findByVideoIdAndAssetType(video.getId(), AssetType.THUMBNAIL)
                .map(a -> {
                    a.replaceObject(s.getStorageBucket(), s.getStorageKey(), s.getContentType(), s.getDeclaredSizeBytes(), ProcessingStatus.READY);
                    return a;
                })
                .orElseGet(() -> VideoAsset.create(
                        video.getId(), AssetType.THUMBNAIL, ProcessingStatus.READY,
                        s.getStorageBucket(), s.getStorageKey(), s.getContentType(), s.getDeclaredSizeBytes()));
        thumbnail = assets.saveAndFlush(thumbnail);

        s.markCompleted(now);
        sessions.saveAndFlush(s);
        video.setThumbnailAsset(thumbnail.getId());
        videos.saveAndFlush(video);
    }

    private void expireStaleSessions(Video video, Instant now) {
        for (UploadSession s : sessions.findByVideoIdAndStatusIn(video.getId(), List.of(UploadStatus.PENDING, UploadStatus.UPLOADING))) {
            if (s.isExpired(now.minus(COMPLETION_GRACE))) {
                s.expire();
                sessions.saveAndFlush(s);
                video.uploadAbandoned();
                videos.saveAndFlush(video);
            }
        }
    }

    // ---- helpers ----

    private UploadCompleteResponse completion(AuthenticatedUser caller, UploadSession session) {
        Video video = ownedVideo(caller, session.getVideoId());
        return new UploadCompleteResponse(toResponse(session), statusService.of(video));
    }

    private Video ownedVideo(AuthenticatedUser caller, UUID videoId) {
        return videos.findByIdAndCreatorIdAndDeletedAtIsNull(videoId, caller.id()).orElseThrow(() -> new NotFoundException("Video"));
    }

    private UploadSession ownedSession(AuthenticatedUser caller, UUID uploadId) {
        return sessions.findByIdAndCreatorId(uploadId, caller.id()).orElseThrow(() -> new NotFoundException("Upload"));
    }

    private UploadSessionResponse toResponse(UploadSession s) {
        UploadTarget target = null;
        if (s.isInFlight() && !s.isExpired(Instant.now(clock))) {
            Duration remaining = Duration.between(Instant.now(clock), s.getExpiresAt());
            SignedUpload signed = storage.presignPut(s.getStorageKey(), s.getContentType(), s.getDeclaredSizeBytes(), remaining);
            target = new UploadTarget(signed.url(), signed.method(), signed.headers());
        }
        Failure failure = s.getStatus() == UploadStatus.FAILED ? new Failure(s.getFailureCode(), s.getFailureMessage()) : null;
        return new UploadSessionResponse(
                s.getId(),
                s.getVideoId(),
                s.getStatus(),
                s.getAssetKind(),
                s.getOriginalFilename(),
                s.getContentType(),
                s.getDeclaredSizeBytes(),
                s.getUploadedBytes(),
                target,
                s.getExpiresAt(),
                s.getCompletedAt(),
                failure,
                s.getCreatedAt());
    }

    /** Validates type, extension and size for the asset kind. Returns the extension used in the storage key. */
    private String validateFile(InitiateUploadRequest request, AssetKind kind) {
        return kind == AssetKind.THUMBNAIL ? validateThumbnail(request) : validateVideo(request);
    }

    private String validateVideo(InitiateUploadRequest request) {
        String contentType = request.contentType().trim().toLowerCase(Locale.ROOT);
        String expected = EXTENSION_BY_CONTENT_TYPE.get(contentType);
        if (expected == null || !contentType.equals(request.contentType())) {
            throw new BadRequestException(
                    "UNSUPPORTED_VIDEO_FORMAT",
                    "Unsupported video format. Use MP4, MOV or WebM.",
                    List.of(new FieldIssue("contentType", "must be one of video/mp4, video/quicktime, video/webm")));
        }
        String ext = fileExtension(sanitizeFilename(request.filename()));
        if (!ext.equals(expected)) {
            throw new BadRequestException(
                    "UNSUPPORTED_VIDEO_FORMAT",
                    "The file extension does not match the content type.",
                    List.of(new FieldIssue("filename", "must end with ." + expected + " for " + contentType)));
        }
        if (request.sizeBytes() > props.maxUploadBytes()) {
            throw new PayloadTooLargeException(
                    "UPLOAD_TOO_LARGE",
                    "The file is larger than the " + props.maxUploadBytes() + " byte limit.",
                    List.of(new FieldIssue("sizeBytes", "must be at most " + props.maxUploadBytes())));
        }
        return expected;
    }

    private String validateThumbnail(InitiateUploadRequest request) {
        String contentType = request.contentType().trim().toLowerCase(Locale.ROOT);
        String expected = THUMBNAIL_EXTENSION_BY_CONTENT_TYPE.get(contentType);
        if (expected == null || !contentType.equals(request.contentType())) {
            throw new BadRequestException(
                    "UNSUPPORTED_IMAGE_FORMAT",
                    "Unsupported thumbnail format. Use JPG, PNG or WebP.",
                    List.of(new FieldIssue("contentType", "must be one of image/jpeg, image/png, image/webp")));
        }
        String ext = fileExtension(sanitizeFilename(request.filename()));
        // JPEG files carry either extension; everything else must match its one extension.
        boolean matches = ext.equals(expected) || (expected.equals("jpg") && ext.equals("jpeg"));
        if (!matches) {
            throw new BadRequestException(
                    "UNSUPPORTED_IMAGE_FORMAT",
                    "The file extension does not match the content type.",
                    List.of(new FieldIssue("filename", "must end with ." + expected + " for " + contentType)));
        }
        if (request.sizeBytes() > MAX_THUMBNAIL_BYTES) {
            throw new PayloadTooLargeException(
                    "THUMBNAIL_TOO_LARGE",
                    "The thumbnail is larger than the " + MAX_THUMBNAIL_BYTES + " byte limit.",
                    List.of(new FieldIssue("sizeBytes", "must be at most " + MAX_THUMBNAIL_BYTES)));
        }
        return expected;
    }

    private static String fileExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private static String validateIdempotencyKey(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        if (!IDEMPOTENCY_KEY.matcher(key).matches()) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Invalid Idempotency-Key.",
                    List.of(new FieldIssue("Idempotency-Key", "must be 8 to 64 characters: letters, digits, . _ : -")));
        }
        return key;
    }

    private static boolean sameRequest(UploadSession s, InitiateUploadRequest r) {
        return s.getVideoId().equals(r.videoId())
                && s.getAssetKind() == r.assetKindOrDefault()
                && s.getContentType().equals(r.contentType())
                && s.getDeclaredSizeBytes() == r.sizeBytes()
                && s.getOriginalFilename().equals(sanitizeFilename(r.filename()));
    }

    private static boolean sameContentType(String actual, String declared) {
        if (actual == null) {
            return false;
        }
        String base = actual.split(";", 2)[0].trim();
        return base.equalsIgnoreCase(declared);
    }

    /** Keeps only the file name: no directories, no control characters. Stored for display, never used in a path. */
    static String sanitizeFilename(String filename) {
        String name = filename.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("\\p{Cntrl}", "").trim();
        if (name.isEmpty()) {
            throw new BadRequestException(
                    "VALIDATION_ERROR", "Request validation failed.", List.of(new FieldIssue("filename", "must not be blank")));
        }
        return name.length() > 255 ? name.substring(name.length() - 255) : name;
    }
}
