package com.aidrama.video;

import com.aidrama.common.exception.BusinessRuleException;
import com.aidrama.common.exception.ConflictException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.common.persistence.TimestampedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Table {@code videos}. Owns the lifecycle rules that the database also enforces with CHECK
 * constraints, so violations surface as clear business errors instead of SQLSTATE 23514.
 *
 * <p>{@code processing_status} is written only by the upload and processing pipeline methods
 * ({@code beginUpload}, {@code uploadAbandoned}, {@code uploadFailed}, {@code processingQueued},
 * {@code processingSucceeded}, {@code processingFailed}).
 */
@Entity
@Table(name = "videos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Video extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "creator_id", nullable = false)
    private UUID creatorId;

    @Column(name = "series_id")
    private UUID seriesId;

    @Column(name = "season_id")
    private UUID seasonId;

    @Column(name = "episode_number")
    private Integer episodeNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "video_type", nullable = false, length = 10)
    private VideoType type;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "slug", nullable = false, length = 120)
    private String slug;

    @Column(name = "description", nullable = false, length = 5000)
    private String description;

    @Column(name = "thumbnail_asset_id")
    private UUID thumbnailAssetId;

    /**
     * The TRAILER video that backs this title's "Watch trailer" button (self reference, same creator).
     * The database enforces the shape (migration 0011); {@link #linkTrailer} reports the same rules as
     * clear business errors. A soft-deleted trailer keeps the link, so readers must go through
     * {@link #isPlayableTrailer()} instead of trusting this id.
     */
    @Column(name = "trailer_video_id")
    private UUID trailerVideoId;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "genre", length = 40)
    private String genre;

    @Column(name = "language", nullable = false, length = 35)
    private String language;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private Visibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "publication_status", nullable = false, length = 20)
    private PublicationStatus publicationStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "processing_status", nullable = false, length = 20)
    private ProcessingStatus processingStatus;

    @Column(name = "content_rating", length = 20)
    private String contentRating;

    @Column(name = "is_ai_generated", nullable = false)
    private boolean aiGenerated;

    @Column(name = "allow_comments", nullable = false)
    private boolean allowComments;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "like_count", nullable = false)
    private long likeCount;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** A new standalone draft. Episodes need a series and season, which this slice does not create. */
    public static Video draft(
            UUID creatorId,
            VideoType type,
            String title,
            String slug,
            String description,
            String genre,
            String language,
            Visibility visibility,
            boolean aiGenerated) {
        Video v = new Video();
        v.id = UUID.randomUUID();
        v.creatorId = creatorId;
        v.type = type;
        v.title = title;
        v.slug = slug;
        v.description = description;
        v.genre = genre;
        v.language = language;
        v.visibility = visibility;
        v.aiGenerated = aiGenerated;
        v.allowComments = true;
        v.publicationStatus = PublicationStatus.DRAFT;
        v.processingStatus = ProcessingStatus.PENDING;
        return v;
    }

    public boolean isOwnedBy(UUID userId) {
        return creatorId.equals(userId);
    }

    public void updateMetadata(
            String title, String description, String genre, String language, Visibility visibility, boolean aiGenerated) {
        if (publicationStatus == PublicationStatus.REMOVED) {
            throw new BusinessRuleException("VIDEO_REMOVED", "This video has been removed and cannot be edited.");
        }
        if (publicationStatus == PublicationStatus.PUBLISHED && genre == null) {
            throw genreRequired();
        }
        this.title = title;
        this.description = description;
        this.genre = genre;
        this.language = language;
        this.visibility = visibility;
        this.aiGenerated = aiGenerated;
    }

    // ---- upload and processing pipeline ----

    /** A creator may start an upload when nothing has been uploaded yet or the last attempt failed. */
    public void beginUpload() {
        if (publicationStatus == PublicationStatus.REMOVED) {
            throw new BusinessRuleException("VIDEO_REMOVED", "This video has been removed.");
        }
        if (processingStatus != ProcessingStatus.PENDING && processingStatus != ProcessingStatus.FAILED) {
            throw new ConflictException(
                    "VIDEO_ALREADY_UPLOADED", "A video file has already been uploaded or is being processed for this video.");
        }
        processingStatus = ProcessingStatus.UPLOADING;
        publicationStatus = PublicationStatus.DRAFT;
    }

    /** The upload was cancelled or expired before completion. */
    public void uploadAbandoned() {
        if (processingStatus == ProcessingStatus.UPLOADING) {
            processingStatus = ProcessingStatus.PENDING;
        }
    }

    /** The uploaded object failed verification. The creator may retry with a new upload. */
    public void uploadFailed() {
        processingStatus = ProcessingStatus.FAILED;
        publicationStatus = PublicationStatus.FAILED;
    }

    public void processingQueued() {
        processingStatus = ProcessingStatus.PROCESSING;
        publicationStatus = PublicationStatus.PROCESSING;
    }

    public void processingSucceeded(Integer durationSeconds, UUID thumbnailAssetId) {
        processingStatus = ProcessingStatus.READY;
        publicationStatus = PublicationStatus.READY;
        this.durationSeconds = durationSeconds;
        if (thumbnailAssetId != null) {
            this.thumbnailAssetId = thumbnailAssetId;
        }
    }

    /** Points the video at a creator-supplied thumbnail asset, independent of the processing pipeline. */
    public void setThumbnailAsset(UUID thumbnailAssetId) {
        this.thumbnailAssetId = thumbnailAssetId;
    }

    public void processingFailed() {
        processingStatus = ProcessingStatus.FAILED;
        publicationStatus = PublicationStatus.FAILED;
    }

    // ---- publishing ----

    /**
     * Publishes a processed video. Enforces what the database also checks:
     * READY or PUBLISHED requires processing_status READY, and PUBLISHED requires a genre and
     * published_at. Publishing an already published video updates its visibility and genre.
     */
    public void publish(Visibility visibility, String genre, Instant now) {
        if (publicationStatus == PublicationStatus.REMOVED) {
            throw new BusinessRuleException("VIDEO_REMOVED", "This video has been removed and cannot be published.");
        }
        boolean publishable = publicationStatus == PublicationStatus.READY
                || publicationStatus == PublicationStatus.UNPUBLISHED
                || publicationStatus == PublicationStatus.PUBLISHED;
        if (processingStatus != ProcessingStatus.READY || !publishable) {
            throw new BusinessRuleException(
                    "VIDEO_NOT_READY",
                    processingStatus == ProcessingStatus.FAILED
                            ? "This video failed processing and cannot be published."
                            : "This video is not ready to publish. Wait until processing has finished.");
        }
        if (visibility == Visibility.PRIVATE) {
            throw new BusinessRuleException(
                    "VISIBILITY_REQUIRED",
                    "Choose PUBLIC or UNLISTED to publish.",
                    List.of(new FieldIssue("visibility", "must be PUBLIC or UNLISTED")));
        }
        if (genre == null) {
            throw genreRequired();
        }
        this.visibility = visibility;
        this.genre = genre;
        this.publicationStatus = PublicationStatus.PUBLISHED;
        if (this.publishedAt == null) {
            this.publishedAt = now;
        }
    }

    // ---- trailer link ----

    /**
     * Links {@code trailer} as this title's trailer, replacing any current link. Mirrors the database
     * rules of migration 0011 so callers get a business error instead of a constraint violation:
     * not itself, this video is not a TRAILER (no nesting), the trailer is a live TRAILER of the same
     * creator. Whether the trailer is already linked to another title needs a query and is checked by
     * the service. The trailer may still be uploading or processing; it only becomes visible to
     * viewers once {@link #isPlayableTrailer()} holds.
     */
    public void linkTrailer(Video trailer) {
        if (deletedAt != null || publicationStatus == PublicationStatus.REMOVED) {
            throw new BusinessRuleException("VIDEO_REMOVED", "This video has been removed and cannot be edited.");
        }
        if (trailer.id.equals(id)) {
            throw trailerError("TRAILER_SELF_LINK", "A video cannot be its own trailer.");
        }
        if (type == VideoType.TRAILER) {
            throw trailerError("TRAILER_NESTING_NOT_ALLOWED", "A trailer cannot have a trailer of its own.");
        }
        // Same answer for "does not exist", "someone else's" and "deleted", so ids cannot be probed.
        if (!trailer.creatorId.equals(creatorId) || trailer.deletedAt != null || trailer.publicationStatus == PublicationStatus.REMOVED) {
            throw trailerError("TRAILER_NOT_FOUND", "The trailer video was not found.");
        }
        if (trailer.type != VideoType.TRAILER) {
            throw trailerError("NOT_A_TRAILER", "Only a video of type TRAILER can be linked as a trailer.");
        }
        this.trailerVideoId = trailer.id;
    }

    /** Clears the trailer link. A no-op when there is none. */
    public void unlinkTrailer() {
        this.trailerVideoId = null;
    }

    /**
     * True when this video can be played as a trailer: a TRAILER that is not deleted and finished
     * processing (READY or PUBLISHED). Anything else, such as a trailer that is still processing,
     * failed, or was soft-deleted after being linked, is treated as "no trailer".
     */
    public boolean isPlayableTrailer() {
        return type == VideoType.TRAILER
                && deletedAt == null
                && processingStatus == ProcessingStatus.READY
                && (publicationStatus == PublicationStatus.READY || publicationStatus == PublicationStatus.PUBLISHED);
    }

    private static BusinessRuleException trailerError(String code, String message) {
        return new BusinessRuleException(code, message, List.of(new FieldIssue("trailerVideoId", message)));
    }

    // ---- deletion ----

    /**
     * Soft-deletes the video: stamps {@code deletedAt} and moves it to REMOVED. Ownership-scoped
     * queries filter on {@code deletedAt is null}, so after this the video disappears from every
     * creator and public listing. Stored objects and asset rows are left for a later purge job, so
     * the operation stays a single short transaction (child tables use ON DELETE RESTRICT).
     * The trailer link is cleared as well, otherwise the trailer would stay reserved by
     * {@code uq_videos_trailer_video} and could not back another title.
     */
    public void softDelete(Instant now) {
        if (deletedAt != null) {
            throw new ConflictException("VIDEO_ALREADY_DELETED", "This video has already been deleted.");
        }
        deletedAt = now;
        publicationStatus = PublicationStatus.REMOVED;
        trailerVideoId = null;
    }

    private static BusinessRuleException genreRequired() {
        return new BusinessRuleException(
                "GENRE_REQUIRED", "A genre is required to publish.", List.of(new FieldIssue("genre", "is required")));
    }
}
