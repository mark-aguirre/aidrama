package com.aidrama.video;

import com.aidrama.common.api.PageParams;
import com.aidrama.common.api.Paginated;
import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.BusinessRuleException;
import com.aidrama.common.exception.ConflictException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.user.Role;
import com.aidrama.video.VideoDtos.CreateVideoRequest;
import com.aidrama.video.VideoDtos.LinkTrailerRequest;
import com.aidrama.video.VideoDtos.PublishRequest;
import com.aidrama.video.VideoDtos.UpdateVideoRequest;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creator-side video use cases (spec 7.3). Every method takes the authenticated caller, requires
 * the CREATOR role, and loads videos through an ownership-scoped query. A video that exists but
 * belongs to someone else is reported as 404, so ids cannot be probed.
 */
@Service
public class CreatorVideoService {

    private static final Logger log = LoggerFactory.getLogger(CreatorVideoService.class);

    /** Longest accepted search term: the title column holds at most this many characters. */
    private static final int MAX_SEARCH_LENGTH = 200;

    private final VideoRepository videos;
    private final VideoAssembler assembler;
    private final GenreCatalog genres;
    private final SlugGenerator slugs;
    private final Clock clock;

    public CreatorVideoService(
            VideoRepository videos, VideoAssembler assembler, GenreCatalog genres, SlugGenerator slugs, Clock clock) {
        this.videos = videos;
        this.assembler = assembler;
        this.genres = genres;
        this.slugs = slugs;
        this.clock = clock;
    }

    @Transactional
    public VideoResponse create(AuthenticatedUser caller, CreateVideoRequest request) {
        caller.require(Role.CREATOR);
        if (request.type() == VideoType.EPISODE) {
            throw new BusinessRuleException(
                    "EPISODE_NOT_SUPPORTED",
                    "Episodes belong to a series and season. Series management is not available yet.");
        }
        String title = request.title().trim();
        Video video = Video.draft(
                caller.id(),
                request.type(),
                title,
                slugs.generate(title),
                blankToEmpty(request.description()),
                genres.normalize(request.genre()),
                request.language() == null ? "en" : request.language(),
                request.visibility() == null ? Visibility.PRIVATE : request.visibility(),
                request.isAiGenerated());
        Video saved = videos.saveAndFlush(video);
        log.info("Video draft created: videoId={} creatorId={}", saved.getId(), caller.id());
        return assembler.assembleOneForCreator(saved);
    }

    @Transactional
    public VideoResponse update(AuthenticatedUser caller, UUID videoId, UpdateVideoRequest request) {
        Video video = owned(caller, videoId);
        if (!request.version().equals(video.getVersion())) {
            throw staleVersion();
        }
        video.updateMetadata(
                request.title().trim(),
                blankToEmpty(request.description()),
                genres.normalize(request.genre()),
                request.language(),
                request.visibility(),
                request.isAiGenerated());
        Video saved = videos.saveAndFlush(video);
        return assembler.assembleOneForCreator(saved);
    }

    /**
     * The caller's videos, newest first. {@code titleQuery} narrows the result to titles containing
     * that text, case-insensitively, across all of the caller's videos rather than one page of them.
     */
    @Transactional(readOnly = true)
    public Paginated<VideoResponse> list(
            AuthenticatedUser caller, PageParams params, PublicationStatus status, String titleQuery) {
        caller.require(Role.CREATOR);
        Specification<Video> spec = VideoSpecs.ownedBy(caller.id());
        if (status != null) {
            spec = spec.and(VideoSpecs.withPublicationStatus(status));
        }
        String search = normalizeSearch(titleQuery);
        if (search != null) {
            spec = spec.and(VideoSpecs.titleContains(search));
        }
        Page<Video> page = videos.findAll(spec, params.toPageRequest(Sort.by(Sort.Direction.DESC, "createdAt", "id")));
        return Paginated.of(page, assembler::assembleForCreator);
    }

    /**
     * Trims the raw search term and treats blank as absent, so {@code ?q=} and {@code ?q=%20} list
     * everything instead of matching nothing. A term longer than a title can be is a client bug
     * rather than a search, so it is rejected instead of silently returning an empty page.
     */
    private static String normalizeSearch(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MAX_SEARCH_LENGTH) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new FieldIssue("q", "must be at most " + MAX_SEARCH_LENGTH + " characters")));
        }
        return trimmed;
    }

    @Transactional(readOnly = true)
    public VideoResponse get(AuthenticatedUser caller, UUID videoId) {
        return assembler.assembleOneForCreator(owned(caller, videoId));
    }

    /**
     * Publishes a processed video. Omitted body fields keep the video's current genre and
     * visibility. Rules live in {@link Video#publish}; the database re-checks them with CHECK constraints.
     */
    @Transactional
    public VideoResponse publish(AuthenticatedUser caller, UUID videoId, PublishRequest request) {
        Video video = owned(caller, videoId);
        PublishRequest body = request == null ? new PublishRequest(null, null) : request;
        String genre = body.genre() != null ? genres.normalize(body.genre()) : video.getGenre();
        Visibility visibility = body.visibility() != null ? body.visibility() : video.getVisibility();
        video.publish(visibility, genre, Instant.now(clock));
        Video saved = videos.saveAndFlush(video);
        log.info("Video published: videoId={} creatorId={} visibility={}", saved.getId(), caller.id(), saved.getVisibility());
        return assembler.assembleOneForCreator(saved);
    }

    /**
     * Soft-deletes a video the caller owns. The video leaves every creator and public listing and
     * cannot be edited, published or uploaded to afterwards (ownership lookups filter deleted rows).
     * Stored media and asset rows are retained for a later purge job. Idempotency is not promised:
     * a second delete returns 404, since the first one already hid the row.
     */
    @Transactional
    public void delete(AuthenticatedUser caller, UUID videoId) {
        Video video = owned(caller, videoId);
        video.softDelete(Instant.now(clock));
        videos.saveAndFlush(video);
        log.info("Video soft-deleted: videoId={} creatorId={}", videoId, caller.id());
    }

    /**
     * Links one of the caller's TRAILER videos to a title the caller owns, replacing any current
     * trailer. The trailer may still be uploading or processing: viewers only see it once it is ready,
     * and the title publishes on its own readiness either way. Idempotent: linking the current trailer
     * again changes nothing. Both videos are loaded through ownership-scoped queries, so another
     * creator's video is indistinguishable from a missing one.
     */
    @Transactional
    public VideoResponse linkTrailer(AuthenticatedUser caller, UUID videoId, LinkTrailerRequest request) {
        Video parent = owned(caller, videoId);
        UUID trailerId = request.trailerVideoId();
        Video trailer = videos.findByIdAndCreatorIdAndDeletedAtIsNull(trailerId, caller.id())
                .orElseThrow(() -> new BusinessRuleException(
                        "TRAILER_NOT_FOUND",
                        "The trailer video was not found.",
                        List.of(new FieldIssue("trailerVideoId", "The trailer video was not found."))));
        if (trailerId.equals(parent.getTrailerVideoId())) {
            return assembler.assembleOneForCreator(parent);
        }
        // Checked before the entity is modified: a query would auto-flush the new link and the unique index would fire first.
        if (videos.existsByTrailerVideoIdAndIdNot(trailerId, parent.getId())) {
            throw new ConflictException(
                    "TRAILER_ALREADY_LINKED",
                    "This trailer is already linked to another video.",
                    List.of(new FieldIssue("trailerVideoId", "is already linked to another video")));
        }
        parent.linkTrailer(trailer);
        Video saved = videos.saveAndFlush(parent);
        log.info("Trailer linked: videoId={} trailerVideoId={} creatorId={}", saved.getId(), trailerId, caller.id());
        return assembler.assembleOneForCreator(saved);
    }

    /** Removes the trailer link. Idempotent: a title without a trailer is returned unchanged. The trailer video itself is kept. */
    @Transactional
    public VideoResponse unlinkTrailer(AuthenticatedUser caller, UUID videoId) {
        Video video = owned(caller, videoId);
        if (video.getTrailerVideoId() == null) {
            return assembler.assembleOneForCreator(video);
        }
        UUID trailerId = video.getTrailerVideoId();
        video.unlinkTrailer();
        Video saved = videos.saveAndFlush(video);
        log.info("Trailer unlinked: videoId={} trailerVideoId={} creatorId={}", saved.getId(), trailerId, caller.id());
        return assembler.assembleOneForCreator(saved);
    }

    private Video owned(AuthenticatedUser caller, UUID videoId) {
        caller.require(Role.CREATOR);
        return videos.findByIdAndCreatorIdAndDeletedAtIsNull(videoId, caller.id())
                .orElseThrow(() -> new NotFoundException("Video"));
    }

    private static ConflictException staleVersion() {
        return new ConflictException(
                "CONCURRENT_MODIFICATION", "The video was changed by someone else. Reload it and try again.");
    }

    private static String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
