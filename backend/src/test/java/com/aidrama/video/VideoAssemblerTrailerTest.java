package com.aidrama.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.aidrama.like.VideoLikeRepository;
import com.aidrama.series.SeasonRepository;
import com.aidrama.storage.MediaUrls;
import com.aidrama.user.CreatorSummary;
import com.aidrama.user.UserRepository;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * What a reader sees of a linked trailer. A trailer resolves only when it exists, is not deleted,
 * finished processing and has a stream. Everything else reads as "no trailer".
 */
class VideoAssemblerTrailerTest {

    private static final Instant NOW = Instant.parse("2026-11-07T00:00:00Z");

    private final UserRepository users = mock(UserRepository.class);
    private final VideoRepository videoRepository = mock(VideoRepository.class);
    private final VideoAssetRepository assets = mock(VideoAssetRepository.class);
    private final SeasonRepository seasons = mock(SeasonRepository.class);
    private final MediaUrls mediaUrls = mock(MediaUrls.class);
    private final VideoLikeRepository likes = mock(VideoLikeRepository.class);
    private final VideoAssembler assembler = new VideoAssembler(users, videoRepository, assets, seasons, mediaUrls, likes);

    private final UUID creatorId = UUID.randomUUID();
    private final List<VideoAsset> storedAssets = new ArrayList<>();

    @BeforeEach
    void setUp() {
        when(users.findCreatorSummaries(anyCollection()))
                .thenReturn(List.of(new CreatorSummary(creatorId, "maker", "Maker", null, 0)));
        when(mediaUrls.publicUrl(anyString())).thenAnswer(call -> "https://cdn.test/" + call.getArgument(0));
        when(assets.findByVideoIdInAndAssetTypeInAndProcessingStatus(anyCollection(), anyCollection(), any()))
                .thenAnswer(call -> {
                    java.util.Collection<UUID> ids = call.getArgument(0);
                    return storedAssets.stream().filter(a -> ids.contains(a.getVideoId())).toList();
                });
    }

    private Video title() {
        Video v = Video.draft(creatorId, VideoType.MOVIE, "Beyond", "beyond-abc12345", "", "Drama", "en", Visibility.PUBLIC, true);
        v.beginUpload();
        v.processingQueued();
        v.processingSucceeded(600, null);
        return v;
    }

    private Video trailerDraft() {
        return Video.draft(creatorId, VideoType.TRAILER, "Beyond: Trailer", "beyond-trailer-abc12345", "", null, "en", Visibility.PRIVATE, true);
    }

    private Video readyTrailer(UUID thumbnailAssetId) {
        Video t = trailerDraft();
        t.beginUpload();
        t.processingQueued();
        t.processingSucceeded(45, thumbnailAssetId);
        return t;
    }

    private VideoAsset hlsFor(Video video) {
        VideoAsset hls = VideoAsset.create(video.getId(), AssetType.HLS_MASTER, ProcessingStatus.READY, "bucket",
                "videos/" + video.getId() + "/hls/master.m3u8", "application/vnd.apple.mpegurl", 10L);
        storedAssets.add(hls);
        return hls;
    }

    private VideoAsset thumbnailFor(Video video) {
        VideoAsset thumb = VideoAsset.create(video.getId(), AssetType.THUMBNAIL, ProcessingStatus.READY, "bucket",
                "videos/" + video.getId() + "/thumbnail/t.jpg", "image/jpeg", 10L);
        storedAssets.add(thumb);
        return thumb;
    }

    private void linked(Video title, Video trailer) {
        title.linkTrailer(trailer);
        when(videoRepository.findByIdInAndDeletedAtIsNull(anyCollection())).thenReturn(List.of(trailer));
    }

    @Test
    void aReadyTrailerResolvesWithItsPlayableStreamForEveryReader() {
        Video title = title();
        VideoAsset thumb = null;
        Video trailer = readyTrailer(null);
        thumb = thumbnailFor(trailer);
        trailer.setThumbnailAsset(thumb.getId());
        VideoAsset hls = hlsFor(trailer);
        linked(title, trailer);

        for (VideoResponse r : List.of(assembler.assembleOne(title), assembler.assembleOneForCreator(title))) {
            assertThat(r.trailer()).isNotNull();
            assertThat(r.trailer().id()).isEqualTo(trailer.getId());
            assertThat(r.trailer().title()).isEqualTo("Beyond: Trailer");
            assertThat(r.trailer().hlsUrl()).isEqualTo("https://cdn.test/" + hls.getStorageKey());
            assertThat(r.trailer().thumbnailUrl()).isEqualTo("https://cdn.test/" + thumb.getStorageKey());
            assertThat(r.trailer().durationSeconds()).isEqualTo(45);
            assertThat(r.trailerVideoId()).isEqualTo(trailer.getId());
        }
    }

    @Test
    void aTrailerWithoutAThumbnailStillResolves() {
        Video title = title();
        Video trailer = readyTrailer(null);
        hlsFor(trailer);
        linked(title, trailer);

        VideoResponse r = assembler.assembleOne(title);

        assertThat(r.trailer()).isNotNull();
        assertThat(r.trailer().thumbnailUrl()).isNull();
    }

    @Test
    void aTrailerStillProcessingIsHiddenFromViewersButVisibleToItsCreator() {
        Video title = title();
        Video trailer = trailerDraft();
        trailer.beginUpload();
        trailer.processingQueued();
        linked(title, trailer);

        VideoResponse publicView = assembler.assembleOne(title);
        VideoResponse creatorView = assembler.assembleOneForCreator(title);

        assertThat(publicView.trailer()).isNull();
        assertThat(publicView.trailerVideoId()).isNull();
        assertThat(creatorView.trailer()).isNull();
        assertThat(creatorView.trailerVideoId()).isEqualTo(trailer.getId());
    }

    @Test
    void aFailedTrailerIsNoTrailerForViewers() {
        Video title = title();
        Video trailer = trailerDraft();
        trailer.beginUpload();
        trailer.processingQueued();
        trailer.processingFailed();
        linked(title, trailer);

        assertThat(assembler.assembleOne(title).trailer()).isNull();
    }

    @Test
    void aSoftDeletedTrailerIsNoTrailerForAnyone() {
        Video title = title();
        Video trailer = readyTrailer(null);
        hlsFor(trailer);
        title.linkTrailer(trailer);
        // The repository filters deleted rows, so the linked id resolves to nothing.
        when(videoRepository.findByIdInAndDeletedAtIsNull(anyCollection())).thenReturn(List.of());

        VideoResponse publicView = assembler.assembleOne(title);
        VideoResponse creatorView = assembler.assembleOneForCreator(title);

        assertThat(publicView.trailer()).isNull();
        assertThat(publicView.trailerVideoId()).isNull();
        assertThat(creatorView.trailer()).isNull();
        assertThat(creatorView.trailerVideoId()).isNull();
    }

    @Test
    void aDeletedRowThatSlipsThroughIsStillNotPlayable() {
        Video title = title();
        Video trailer = readyTrailer(null);
        hlsFor(trailer);
        linked(title, trailer);
        trailer.softDelete(NOW);

        assertThat(assembler.assembleOne(title).trailer()).isNull();
    }

    @Test
    void aReadyTrailerWithoutAStreamIsNotPlayable() {
        Video title = title();
        Video trailer = readyTrailer(null); // no HLS asset registered
        linked(title, trailer);

        VideoResponse publicView = assembler.assembleOne(title);

        assertThat(publicView.trailer()).isNull();
        assertThat(publicView.trailerVideoId()).isNull();
        assertThat(assembler.assembleOneForCreator(title).trailerVideoId()).isEqualTo(trailer.getId());
    }

    @Test
    void aTrailerOfAnotherCreatorIsIgnored() {
        Video title = title();
        Video foreign = Video.draft(UUID.randomUUID(), VideoType.TRAILER, "Foreign", "foreign-abc12345", "", null, "en", Visibility.PRIVATE, true);
        foreign.beginUpload();
        foreign.processingQueued();
        foreign.processingSucceeded(10, null);
        hlsFor(foreign);
        org.springframework.test.util.ReflectionTestUtils.setField(title, "trailerVideoId", foreign.getId());
        when(videoRepository.findByIdInAndDeletedAtIsNull(anyCollection())).thenReturn(List.of(foreign));

        assertThat(assembler.assembleOne(title).trailer()).isNull();
        assertThat(assembler.assembleOneForCreator(title).trailerVideoId()).isNull();
    }

    @Test
    void aTitleWithoutATrailerCostsNoTrailerQuery() {
        VideoResponse r = assembler.assembleOne(title());

        assertThat(r.trailer()).isNull();
        assertThat(r.trailerVideoId()).isNull();
        verify(videoRepository, never()).findByIdInAndDeletedAtIsNull(anyCollection());
    }

    @Test
    void aPageResolvesAllItsTrailersWithOneTrailerQueryAndOneAssetQuery() {
        Video first = title();
        Video second = title();
        Video bare = title();
        Video firstTrailer = readyTrailer(null);
        Video secondTrailer = readyTrailer(null);
        hlsFor(firstTrailer);
        hlsFor(secondTrailer);
        first.linkTrailer(firstTrailer);
        second.linkTrailer(secondTrailer);
        when(videoRepository.findByIdInAndDeletedAtIsNull(anyCollection())).thenReturn(List.of(firstTrailer, secondTrailer));

        List<VideoResponse> page = assembler.assemble(List.of(first, bare, second));

        assertThat(page).extracting(r -> r.trailer() == null ? null : r.trailer().id())
                .containsExactly(firstTrailer.getId(), null, secondTrailer.getId());
        verify(videoRepository, times(1)).findByIdInAndDeletedAtIsNull(anyCollection());
        verify(assets, times(1)).findByVideoIdInAndAssetTypeInAndProcessingStatus(anyCollection(), anyCollection(), any());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<java.util.Collection<UUID>> trailerIds = ArgumentCaptor.forClass(java.util.Collection.class);
        verify(videoRepository).findByIdInAndDeletedAtIsNull(trailerIds.capture());
        assertThat(Set.copyOf(trailerIds.getValue())).containsExactlyInAnyOrder(firstTrailer.getId(), secondTrailer.getId());
    }
}
