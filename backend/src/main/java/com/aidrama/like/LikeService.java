package com.aidrama.like;

import com.aidrama.common.exception.NotFoundException;
import com.aidrama.common.exception.UnauthorizedException;
import com.aidrama.like.LikeDtos.LikeStateResponse;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.video.Video;
import com.aidrama.video.VideoRepository;
import com.aidrama.video.VideoSpecs;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Likes and unlikes videos.
 *
 * <p>Counting rule: a video's {@code like_count} goes up by exactly 1 when the {@code video_likes} insert wrote
 * a row, and down by exactly 1 when the delete removed a row. Nothing else touches the counter, so repeating a
 * call or racing two identical calls cannot double count, and unliking a video that is not liked cannot make
 * the count negative. The row change and the counter update run in one transaction.
 *
 * <p>Only videos that {@link VideoSpecs#linkable()} lets anyone open can be liked (same rule as views), so
 * drafts, private and soft-deleted videos answer 404, even for their owner. The liking user is always the
 * authenticated caller.
 */
@Service
public class LikeService {

    private static final Logger log = LoggerFactory.getLogger(LikeService.class);

    private final VideoRepository videos;
    private final VideoLikeRepository likes;

    public LikeService(VideoRepository videos, VideoLikeRepository likes) {
        this.videos = videos;
        this.likes = likes;
    }

    /**
     * @param slug the video's public slug, same identifier as {@code GET /videos/{slug}}
     * @param user the signed-in caller from the validated token
     */
    @Transactional
    public LikeStateResponse like(String slug, AuthenticatedUser user) {
        requireSignedIn(user);
        Video video = likeableVideo(slug);
        boolean changed = likes.insertIfAbsent(video.getId(), user.id());
        if (changed) {
            videos.incrementLikeCount(video.getId());
        }
        log.debug("Like videoId={} changed={}", video.getId(), changed);
        return new LikeStateResponse(true, currentLikeCount(video.getId()));
    }

    @Transactional
    public LikeStateResponse unlike(String slug, AuthenticatedUser user) {
        requireSignedIn(user);
        Video video = likeableVideo(slug);
        boolean changed = likes.delete(video.getId(), user.id());
        if (changed) {
            videos.decrementLikeCount(video.getId());
        }
        log.debug("Unlike videoId={} changed={}", video.getId(), changed);
        return new LikeStateResponse(false, currentLikeCount(video.getId()));
    }

    private static void requireSignedIn(AuthenticatedUser user) {
        if (user == null) {
            throw new UnauthorizedException("UNAUTHENTICATED", "Authentication is required.");
        }
    }

    private Video likeableVideo(String slug) {
        return videos.findOne(VideoSpecs.linkable().and(VideoSpecs.withSlug(slug)))
                .orElseThrow(() -> new NotFoundException("Video"));
    }

    /** Read from the database, not from the loaded entity, which predates the bulk counter update. */
    private long currentLikeCount(UUID videoId) {
        return videos.findLikeCountById(videoId).orElseThrow(() -> new NotFoundException("Video"));
    }
}
