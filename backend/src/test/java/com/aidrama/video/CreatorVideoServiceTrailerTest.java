package com.aidrama.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.aidrama.common.exception.ApiException;
import com.aidrama.common.exception.ConflictException;
import com.aidrama.common.exception.ForbiddenException;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.user.Role;
import com.aidrama.video.VideoDtos.LinkTrailerRequest;
import com.aidrama.video.VideoDtos.PublishRequest;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Link, unlink and publish use cases around the trailer, with the repository and assembler mocked. */
class CreatorVideoServiceTrailerTest {

    private final VideoRepository videos = mock(VideoRepository.class);
    private final VideoAssembler assembler = mock(VideoAssembler.class);
    private final GenreCatalog genres = mock(GenreCatalog.class);
    private final SlugGenerator slugs = mock(SlugGenerator.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-07T00:00:00Z"), ZoneOffset.UTC);
    private final CreatorVideoService service = new CreatorVideoService(videos, assembler, genres, slugs, clock);

    private final UUID creatorId = UUID.randomUUID();
    private final AuthenticatedUser creator = new AuthenticatedUser(creatorId, Set.of(Role.USER, Role.CREATOR));
    private final VideoResponse response = mock(VideoResponse.class);

    private Video title;
    private Video trailer;

    @BeforeEach
    void setUp() {
        title = Video.draft(creatorId, VideoType.MOVIE, "Beyond", "beyond-abc12345", "", "Drama", "en", Visibility.PRIVATE, true);
        trailer = Video.draft(creatorId, VideoType.TRAILER, "Beyond: Trailer", "beyond-trailer-abc12345", "", null, "en", Visibility.PRIVATE, true);
        when(videos.findByIdAndCreatorIdAndDeletedAtIsNull(title.getId(), creatorId)).thenReturn(Optional.of(title));
        when(videos.findByIdAndCreatorIdAndDeletedAtIsNull(trailer.getId(), creatorId)).thenReturn(Optional.of(trailer));
        when(videos.saveAndFlush(any(Video.class))).thenAnswer(call -> call.getArgument(0));
        when(assembler.assembleOneForCreator(any(Video.class))).thenReturn(response);
    }

    private static String codeOf(Throwable t) {
        return ((ApiException) t).getCode();
    }

    // ---- link ----

    @Test
    void linksTheTrailerAndReturnsTheCreatorView() {
        VideoResponse result = service.linkTrailer(creator, title.getId(), new LinkTrailerRequest(trailer.getId()));

        assertThat(result).isSameAs(response);
        assertThat(title.getTrailerVideoId()).isEqualTo(trailer.getId());
        verify(videos).saveAndFlush(title);
        verify(assembler).assembleOneForCreator(title);
    }

    @Test
    void linkingTheCurrentTrailerAgainWritesNothing() {
        title.linkTrailer(trailer);

        service.linkTrailer(creator, title.getId(), new LinkTrailerRequest(trailer.getId()));

        verify(videos, never()).saveAndFlush(any());
        verify(videos, never()).existsByTrailerVideoIdAndIdNot(any(), any());
    }

    @Test
    void aTrailerBackingAnotherTitleIsA409AndLeavesTheTitleUntouched() {
        when(videos.existsByTrailerVideoIdAndIdNot(trailer.getId(), title.getId())).thenReturn(true);

        assertThatThrownBy(() -> service.linkTrailer(creator, title.getId(), new LinkTrailerRequest(trailer.getId())))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo("TRAILER_ALREADY_LINKED"));

        assertThat(title.getTrailerVideoId()).isNull();
        verify(videos, never()).saveAndFlush(any());
    }

    @Test
    void aTrailerThatDoesNotExistOrBelongsToSomeoneElseIsA422NotFound() {
        UUID unknown = UUID.randomUUID();
        when(videos.findByIdAndCreatorIdAndDeletedAtIsNull(unknown, creatorId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.linkTrailer(creator, title.getId(), new LinkTrailerRequest(unknown)))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> {
                    assertThat(codeOf(e)).isEqualTo("TRAILER_NOT_FOUND");
                    assertThat(((ApiException) e).getStatus().value()).isEqualTo(422);
                });
        verify(videos, never()).saveAndFlush(any());
    }

    @Test
    void aVideoThatIsNotATrailerIsRejected() {
        Video other = Video.draft(creatorId, VideoType.SHORT, "Other", "other-abc12345", "", null, "en", Visibility.PRIVATE, true);
        when(videos.findByIdAndCreatorIdAndDeletedAtIsNull(other.getId(), creatorId)).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.linkTrailer(creator, title.getId(), new LinkTrailerRequest(other.getId())))
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo("NOT_A_TRAILER"));
        verify(videos, never()).saveAndFlush(any());
    }

    @Test
    void aVideoCannotBeItsOwnTrailer() {
        assertThatThrownBy(() -> service.linkTrailer(creator, title.getId(), new LinkTrailerRequest(title.getId())))
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo("TRAILER_SELF_LINK"));
    }

    @Test
    void aTrailerCannotCarryATrailer() {
        Video second = Video.draft(creatorId, VideoType.TRAILER, "Second", "second-abc12345", "", null, "en", Visibility.PRIVATE, true);
        when(videos.findByIdAndCreatorIdAndDeletedAtIsNull(second.getId(), creatorId)).thenReturn(Optional.of(second));

        assertThatThrownBy(() -> service.linkTrailer(creator, trailer.getId(), new LinkTrailerRequest(second.getId())))
                .satisfies(e -> assertThat(codeOf(e)).isEqualTo("TRAILER_NESTING_NOT_ALLOWED"));
    }

    @Test
    void anotherCreatorsTitleIsA404() {
        UUID foreignTitle = UUID.randomUUID();
        when(videos.findByIdAndCreatorIdAndDeletedAtIsNull(foreignTitle, creatorId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.linkTrailer(creator, foreignTitle, new LinkTrailerRequest(trailer.getId())))
                .isInstanceOf(NotFoundException.class);
        verify(videos, never()).saveAndFlush(any());
    }

    @Test
    void linkAndUnlinkRequireTheCreatorRole() {
        AuthenticatedUser viewer = new AuthenticatedUser(creatorId, Set.of(Role.USER));

        assertThatThrownBy(() -> service.linkTrailer(viewer, title.getId(), new LinkTrailerRequest(trailer.getId())))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> service.unlinkTrailer(viewer, title.getId())).isInstanceOf(ForbiddenException.class);
        verifyNoInteractions(assembler);
        verify(videos, never()).saveAndFlush(any());
    }

    // ---- unlink ----

    @Test
    void unlinkClearsTheLinkAndKeepsTheTrailerVideo() {
        title.linkTrailer(trailer);

        VideoResponse result = service.unlinkTrailer(creator, title.getId());

        assertThat(result).isSameAs(response);
        assertThat(title.getTrailerVideoId()).isNull();
        assertThat(trailer.getDeletedAt()).isNull();
        verify(videos).saveAndFlush(title);
    }

    @Test
    void unlinkWithoutATrailerIsAHarmlessNoOp() {
        VideoResponse result = service.unlinkTrailer(creator, title.getId());

        assertThat(result).isSameAs(response);
        verify(videos, never()).saveAndFlush(any());
    }

    // ---- delete ----

    @Test
    void deletingTheTitleClearsItsTrailerLinkSoTheTrailerIsFreeAgain() {
        title.linkTrailer(trailer);

        service.delete(creator, title.getId());

        assertThat(title.getDeletedAt()).isNotNull();
        assertThat(title.getTrailerVideoId()).isNull();
        verify(videos).saveAndFlush(title);
    }

    // ---- the title publishes on its own readiness ----

    @Test
    void theTitlePublishesWhileItsLinkedTrailerIsStillProcessing() {
        title.beginUpload();
        title.processingQueued();
        title.processingSucceeded(120, null);
        trailer.beginUpload();
        trailer.processingQueued(); // trailer still PROCESSING
        title.linkTrailer(trailer);
        when(genres.normalize("Drama")).thenReturn("Drama");

        service.publish(creator, title.getId(), new PublishRequest("Drama", Visibility.PUBLIC));

        assertThat(title.getPublicationStatus()).isEqualTo(PublicationStatus.PUBLISHED);
        assertThat(trailer.getProcessingStatus()).isEqualTo(ProcessingStatus.PROCESSING);
        assertThat(title.getTrailerVideoId()).isEqualTo(trailer.getId());
    }

    @Test
    void theTitlePublishesWithAMissingTrailerToo() {
        title.beginUpload();
        title.processingQueued();
        title.processingSucceeded(120, null);
        when(genres.normalize("Drama")).thenReturn("Drama");

        service.publish(creator, title.getId(), new PublishRequest("Drama", Visibility.PUBLIC));

        assertThat(title.getPublicationStatus()).isEqualTo(PublicationStatus.PUBLISHED);
        assertThat(title.getTrailerVideoId()).isNull();
    }
}
