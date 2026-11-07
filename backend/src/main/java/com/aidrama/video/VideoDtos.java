package com.aidrama.video;

import com.aidrama.user.CreatorSummary;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Request and response bodies for videos. */
public final class VideoDtos {

    private static final String LANGUAGE_TAG = "^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$";

    private VideoDtos() {}

    /**
     * The {@code Video} type of the frontend domain types, plus three additive fields:
     * {@code seasonNumber}, {@code episodeNumber} and {@code version} (needed for optimistic locking on update),
     * and the trailer fields. {@code genre} is an empty string and {@code durationSeconds} is 0 until they are known.
     *
     * <p>Trailer fields: {@code trailer} is the playable trailer or null (see {@link TrailerResponse}). It is the
     * only trailer field public readers see in a meaningful way. {@code trailerVideoId} is the linked trailer's id
     * on creator reads (set while the linked trailer exists and is not deleted, even if it is still processing, so
     * the creator UI can poll it); on public reads it equals {@code trailer.id} or is null.
     *
     * <p>{@code isLiked} is whether the signed-in caller likes this video. It is always false for anonymous
     * callers and on creator endpoints ({@code /creator/**}), which do not resolve the caller's likes.
     */
    public record VideoResponse(
            UUID id,
            String slug,
            String title,
            String description,
            VideoType type,
            String thumbnailUrl,
            String hlsUrl,
            int durationSeconds,
            String genre,
            String language,
            Visibility visibility,
            PublicationStatus publicationStatus,
            ProcessingStatus processingStatus,
            @JsonProperty("isAiGenerated") boolean isAiGenerated,
            long viewCount,
            long likeCount,
            @JsonProperty("isLiked") boolean isLiked,
            Instant publishedAt,
            Instant createdAt,
            CreatorSummary creator,
            Integer seasonNumber,
            Integer episodeNumber,
            long version,
            UUID trailerVideoId,
            TrailerResponse trailer) {}

    /**
     * The playable trailer of a title. Present on {@link VideoResponse#trailer()} only when the trailer
     * exists, is not deleted, finished processing and has a playable stream, so {@code hlsUrl} is never null.
     * {@code thumbnailUrl} is null when the trailer has no thumbnail; fall back to the title's own.
     */
    public record TrailerResponse(UUID id, String title, String hlsUrl, String thumbnailUrl, int durationSeconds) {}

    /** Body of {@code POST /creator/videos/{id}/trailer}. */
    public record LinkTrailerRequest(@NotNull UUID trailerVideoId) {}

    public record CreateVideoRequest(
            @NotNull VideoType type,
            @NotBlank @Size(max = 200) String title,
            @Size(max = 5000) String description,
            @Size(max = 40) String genre,
            @Size(max = 35) @Pattern(regexp = LANGUAGE_TAG, message = "must be a language tag such as en or pt-BR") String language,
            Visibility visibility,
            @NotNull @JsonProperty("isAiGenerated") Boolean isAiGenerated) {}

    /** Full replacement of the editable fields. {@code version} must equal the version last read. */
    public record UpdateVideoRequest(
            @NotBlank @Size(max = 200) String title,
            @Size(max = 5000) String description,
            @Size(max = 40) String genre,
            @NotBlank @Size(max = 35) @Pattern(regexp = LANGUAGE_TAG, message = "must be a language tag such as en or pt-BR") String language,
            @NotNull Visibility visibility,
            @NotNull @JsonProperty("isAiGenerated") Boolean isAiGenerated,
            @NotNull Long version) {}

    /** Optional body. Omitted fields keep the video's current genre and visibility. */
    public record PublishRequest(@Size(max = 40) String genre, Visibility visibility) {}
}
