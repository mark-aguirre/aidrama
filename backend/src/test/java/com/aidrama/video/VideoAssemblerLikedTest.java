package com.aidrama.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.aidrama.like.VideoLikeRepository;
import com.aidrama.series.SeasonRepository;
import com.aidrama.storage.MediaUrls;
import com.aidrama.user.CreatorSummary;
import com.aidrama.user.UserRepository;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** {@code isLiked} on {@link VideoResponse}: the viewer's likes are read once per page, never per video. */
class VideoAssemblerLikedTest {

    private final UserRepository users = mock(UserRepository.class);
    private final VideoLikeRepository likes = mock(VideoLikeRepository.class);
    private final VideoAssembler assembler = new VideoAssembler(
            users, mock(VideoRepository.class), mock(VideoAssetRepository.class), mock(SeasonRepository.class), mock(MediaUrls.class), likes);

    private final UUID creatorId = UUID.randomUUID();
    private final UUID viewerId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        when(users.findCreatorSummaries(anyCollection())).thenReturn(List.of(new CreatorSummary(creatorId, "maker", "Maker", null, 0)));
    }

    private Video video(String slug) {
        return Video.draft(creatorId, VideoType.MOVIE, slug, slug, "", "Drama", "en", Visibility.PUBLIC, true);
    }

    @Test
    void isLikedReflectsTheViewersLikesAcrossAPageWithOneQuery() {
        Video liked = video("liked-one");
        Video notLiked = video("not-liked");
        Video alsoLiked = video("liked-two");
        when(likes.findLikedVideoIds(any(), anyCollection())).thenReturn(Set.of(liked.getId(), alsoLiked.getId()));

        List<VideoResponse> page = assembler.assemble(List.of(liked, notLiked, alsoLiked), viewerId);

        assertThat(page).extracting(VideoResponse::isLiked).containsExactly(true, false, true);
        verify(likes, times(1)).findLikedVideoIds(any(), anyCollection());
        verify(likes).findLikedVideoIds(viewerId, List.of(liked.getId(), notLiked.getId(), alsoLiked.getId()));
    }

    @Test
    void assembleOneWithAViewerSetsIsLiked() {
        Video v = video("single");
        when(likes.findLikedVideoIds(viewerId, List.of(v.getId()))).thenReturn(Set.of(v.getId()));

        assertThat(assembler.assembleOne(v, viewerId).isLiked()).isTrue();
    }

    @Test
    void anonymousCallerGetsFalseWithoutAnyLikeQuery() {
        Video v = video("anon");

        assertThat(assembler.assembleOne(v, null).isLiked()).isFalse();
        assertThat(assembler.assembleOne(v).isLiked()).isFalse();
        assertThat(assembler.assemble(List.of(v)).getFirst().isLiked()).isFalse();
        verifyNoInteractions(likes);
    }

    @Test
    void creatorViewDoesNotResolveLikes() {
        Video v = video("creator");

        assertThat(assembler.assembleOneForCreator(v).isLiked()).isFalse();
        verifyNoInteractions(likes);
    }

    @Test
    void emptyPageRunsNoQuery() {
        assertThat(assembler.assemble(List.of(), viewerId)).isEmpty();
        verifyNoInteractions(likes);
    }
}
