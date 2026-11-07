package com.aidrama.view;

import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.config.AppProperties;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.video.Video;
import com.aidrama.video.VideoRepository;
import com.aidrama.video.VideoSpecs;
import com.aidrama.view.ViewDtos.RecordViewRequest;
import com.aidrama.view.ViewDtos.RecordViewResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records playback events and counts views.
 *
 * <p>Counting rule: a video's {@code view_count} goes up by exactly 1 when a {@code VIEW_QUALIFIED} event
 * with {@code watchedSeconds >= aidrama.views.qualified-seconds} (default 10) is stored for the first time
 * in its de-duplication window. {@code PLAY_START} and {@code PLAY_COMPLETE} are stored but never count.
 * A {@code VIEW_QUALIFIED} below the threshold is neither stored nor counted.
 *
 * <p>De-duplication window: one event of each type per viewer and video per UTC calendar day, enforced by
 * the database through {@code dedupe_key}. The counter is bumped only when the insert really wrote a row,
 * in the same transaction, so retries and concurrent duplicates cannot double count.
 *
 * <p>Viewing is public. Only videos that {@link VideoSpecs#linkable()} lets anyone open can be viewed, so
 * drafts and private videos (even the owner's) answer 404 and cannot inflate counts.
 */
@Service
public class ViewService {

    private static final Logger log = LoggerFactory.getLogger(ViewService.class);

    private final VideoRepository videos;
    private final VideoViewEventRepository events;
    private final ViewKeys keys;
    private final Clock clock;
    private final int qualifiedSeconds;

    public ViewService(
            VideoRepository videos, VideoViewEventRepository events, ViewKeys keys, Clock clock, AppProperties props) {
        this.videos = videos;
        this.events = events;
        this.keys = keys;
        this.clock = clock;
        this.qualifiedSeconds = props.views().qualifiedSeconds();
    }

    /**
     * @param slug the video's public slug, same identifier as {@code GET /videos/{slug}}
     * @param viewer the signed-in caller from the validated token, or null for an anonymous one
     */
    @Transactional
    public RecordViewResponse record(String slug, RecordViewRequest request, AuthenticatedUser viewer) {
        String viewerKey = viewerKey(request, viewer);
        Video video = videos.findOne(VideoSpecs.linkable().and(VideoSpecs.withSlug(slug)))
                .orElseThrow(() -> new NotFoundException("Video"));

        ViewEventType type = request.eventType();
        int watched = request.watchedSeconds();
        boolean qualifies = type == ViewEventType.VIEW_QUALIFIED && watched >= qualifiedSeconds;
        if (type == ViewEventType.VIEW_QUALIFIED && !qualifies) {
            return new RecordViewResponse(false, false);
        }

        LocalDate day = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        String dedupeKey = keys.dedupeKey(viewerKey, video.getId(), type, day);
        UUID viewerUserId = viewer == null ? null : viewer.id();
        boolean inserted = events.insertIfAbsent(video.getId(), viewerUserId, viewerKey, type, watched, dedupeKey);

        boolean counted = inserted && qualifies;
        if (counted) {
            videos.incrementViewCount(video.getId());
        }
        log.debug("View event videoId={} type={} recorded={} counted={}", video.getId(), type, inserted, counted);
        return new RecordViewResponse(inserted, counted);
    }

    /** Signed-in callers are identified by their token, anonymous ones by the client-held session id. */
    private String viewerKey(RecordViewRequest request, AuthenticatedUser viewer) {
        if (viewer != null) {
            return keys.forUser(viewer.id());
        }
        if (request.sessionId() == null) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new FieldIssue("sessionId", "is required when not signed in")));
        }
        return keys.forSession(request.sessionId());
    }
}
