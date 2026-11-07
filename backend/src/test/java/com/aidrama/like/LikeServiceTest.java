package com.aidrama.like;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.aidrama.common.exception.ApiException;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.common.exception.UnauthorizedException;
import com.aidrama.like.LikeDtos.LikeStateResponse;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.user.Role;
import com.aidrama.video.Video;
import com.aidrama.video.VideoRepository;
import com.aidrama.video.VideoType;
import com.aidrama.video.Visibility;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.domain.Specification;

/**
 * Counting rules of {@link LikeService}. The two repositories are mocked, but behave like the database where it
 * matters: the like "table" is a set of (video, user) pairs, so a repeated insert reports no change, and the
 * counter update keeps the {@code > 0} guard. The SQL itself is covered by {@code LikeToggleIT}, which needs Docker.
 */
class LikeServiceTest {

    private static final String SLUG = "beyond-abc12345";

    private final VideoRepository videos = mock(VideoRepository.class);
    private final VideoLikeRepository likes = mock(VideoLikeRepository.class);
    private final LikeService service = new LikeService(videos, likes);

    private final Set<List<UUID>> likeRows = new HashSet<>();
    private final AtomicLong likeCount = new AtomicLong();

    private Video video;
    private final AuthenticatedUser user = new AuthenticatedUser(UUID.randomUUID(), Set.of(Role.USER));

    @BeforeEach
    void setUp() {
        video = Video.draft(UUID.randomUUID(), VideoType.MOVIE, "Beyond", SLUG, "", "Drama", "en", Visibility.PUBLIC, true);
        when(videos.findOne(anySpec())).thenReturn(Optional.of(video));
        when(likes.insertIfAbsent(any(), any())).thenAnswer(call -> likeRows.add(List.of(call.getArgument(0), call.getArgument(1))));
        when(likes.delete(any(), any())).thenAnswer(call -> likeRows.remove(List.of(call.getArgument(0), call.getArgument(1))));
        when(videos.incrementLikeCount(any())).thenAnswer(call -> {
            likeCount.incrementAndGet();
            return 1;
        });
        when(videos.decrementLikeCount(any())).thenAnswer(call -> {
            if (likeCount.get() > 0) {
                likeCount.decrementAndGet();
                return 1;
            }
            return 0;
        });
        when(videos.findLikeCountById(any())).thenAnswer(call -> Optional.of(likeCount.get()));
    }

    @SuppressWarnings("unchecked")
    private static Specification<Video> anySpec() {
        return any(Specification.class);
    }

    // ---- (a) like ----

    @Test
    void likeInsertsTheRowForTheCallerAndBumpsTheCounterByOne() {
        LikeStateResponse result = service.like(SLUG, user);

        assertThat(result).isEqualTo(new LikeStateResponse(true, 1));
        verify(likes).insertIfAbsent(video.getId(), user.id());
        verify(videos, times(1)).incrementLikeCount(video.getId());
        assertThat(likeRows).containsExactly(List.of(video.getId(), user.id()));
    }

    // ---- (b) idempotent like ----

    @Test
    void likingAgainChangesNothingAndDoesNotCountTwice() {
        service.like(SLUG, user);

        LikeStateResponse again = service.like(SLUG, user);

        assertThat(again).isEqualTo(new LikeStateResponse(true, 1));
        verify(videos, times(1)).incrementLikeCount(video.getId());
        assertThat(likeRows).hasSize(1);
    }

    @Test
    void twoDifferentUsersEachCountOnce() {
        service.like(SLUG, user);

        LikeStateResponse other = service.like(SLUG, new AuthenticatedUser(UUID.randomUUID(), Set.of(Role.USER)));

        assertThat(other.likeCount()).isEqualTo(2);
    }

    // ---- (c) unlike ----

    @Test
    void unlikeDeletesTheRowAndDropsTheCounterByOne() {
        service.like(SLUG, user);

        LikeStateResponse result = service.unlike(SLUG, user);

        assertThat(result).isEqualTo(new LikeStateResponse(false, 0));
        verify(likes).delete(video.getId(), user.id());
        verify(videos, times(1)).decrementLikeCount(video.getId());
        assertThat(likeRows).isEmpty();
    }

    // ---- (d) unlike when not liked ----

    @Test
    void unlikeWhenNotLikedIsANoOpAndTheCountStaysAtItsValue() {
        likeCount.set(3); // other users' likes

        LikeStateResponse result = service.unlike(SLUG, user);

        assertThat(result).isEqualTo(new LikeStateResponse(false, 3));
        verify(videos, never()).decrementLikeCount(any());
    }

    @Test
    void unlikeWhenNotLikedNeverGoesNegative() {
        LikeStateResponse first = service.unlike(SLUG, user);
        LikeStateResponse second = service.unlike(SLUG, user);

        assertThat(first.likeCount()).isZero();
        assertThat(second.likeCount()).isZero();
        verify(videos, never()).decrementLikeCount(any());
    }

    @Test
    void likeUnlikeLikeEndsLiked() {
        service.like(SLUG, user);
        service.unlike(SLUG, user);

        assertThat(service.like(SLUG, user)).isEqualTo(new LikeStateResponse(true, 1));
    }

    // ---- (e) anonymous ----

    @Test
    void anonymousCallerIsRejectedBeforeAnythingIsReadOrWritten() {
        assertThatThrownBy(() -> service.like(SLUG, null))
                .isInstanceOf(UnauthorizedException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus().value()).isEqualTo(401));
        assertThatThrownBy(() -> service.unlike(SLUG, null)).isInstanceOf(UnauthorizedException.class);
        verifyNoInteractions(videos, likes);
    }

    // ---- (f) unknown or non-viewable video ----

    @Test
    void unknownOrNonViewableVideoIsA404AndWritesNothing() {
        when(videos.findOne(anySpec())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.like("nope", user))
                .isInstanceOf(NotFoundException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus().value()).isEqualTo(404));
        assertThatThrownBy(() -> service.unlike("nope", user)).isInstanceOf(NotFoundException.class);
        verifyNoInteractions(likes);
        verify(videos, never()).incrementLikeCount(any());
        verify(videos, never()).decrementLikeCount(any());
    }
}
