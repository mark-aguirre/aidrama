package com.aidrama.video;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aidrama.common.exception.BusinessRuleException;
import com.aidrama.common.exception.ConflictException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Domain rules of the video lifecycle. These mirror the database CHECK constraints. */
class VideoTest {

    private static final Instant NOW = Instant.parse("2026-11-07T00:00:00Z");

    private Video draft() {
        return Video.draft(UUID.randomUUID(), VideoType.MOVIE, "Beyond", "beyond-abc12345", "", null, "en", Visibility.PRIVATE, true);
    }

    private Video processed() {
        Video v = draft();
        v.beginUpload();
        v.processingQueued();
        v.processingSucceeded(120, null);
        return v;
    }

    @Test
    void newDraftStartsPendingAndPrivate() {
        Video v = draft();
        assertThat(v.getPublicationStatus()).isEqualTo(PublicationStatus.DRAFT);
        assertThat(v.getProcessingStatus()).isEqualTo(ProcessingStatus.PENDING);
        assertThat(v.getVisibility()).isEqualTo(Visibility.PRIVATE);
    }

    @Test
    void cannotPublishBeforeProcessingFinishes() {
        Video v = draft();
        assertThatThrownBy(() -> v.publish(Visibility.PUBLIC, "Drama", NOW))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code")
                .isEqualTo("VIDEO_NOT_READY");

        v.beginUpload();
        v.processingQueued();
        assertThatThrownBy(() -> v.publish(Visibility.PUBLIC, "Drama", NOW))
                .extracting("code")
                .isEqualTo("VIDEO_NOT_READY");
    }

    @Test
    void cannotPublishAFailedVideo() {
        Video v = draft();
        v.beginUpload();
        v.processingQueued();
        v.processingFailed();
        assertThatThrownBy(() -> v.publish(Visibility.PUBLIC, "Drama", NOW))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("failed processing");
    }

    @Test
    void publishRequiresGenre() {
        Video v = processed();
        assertThatThrownBy(() -> v.publish(Visibility.PUBLIC, null, NOW))
                .extracting("code")
                .isEqualTo("GENRE_REQUIRED");
    }

    @Test
    void publishRequiresPublicOrUnlisted() {
        Video v = processed();
        assertThatThrownBy(() -> v.publish(Visibility.PRIVATE, "Drama", NOW))
                .extracting("code")
                .isEqualTo("VISIBILITY_REQUIRED");
    }

    @Test
    void publishSetsStatusTimestampGenreAndVisibility() {
        Video v = processed();
        v.publish(Visibility.PUBLIC, "Drama", NOW);
        assertThat(v.getPublicationStatus()).isEqualTo(PublicationStatus.PUBLISHED);
        assertThat(v.getPublishedAt()).isEqualTo(NOW);
        assertThat(v.getGenre()).isEqualTo("Drama");
        assertThat(v.getVisibility()).isEqualTo(Visibility.PUBLIC);
    }

    @Test
    void republishingKeepsOriginalPublishedAt() {
        Video v = processed();
        v.publish(Visibility.PUBLIC, "Drama", NOW);
        v.publish(Visibility.UNLISTED, "Drama", NOW.plusSeconds(3600));
        assertThat(v.getPublishedAt()).isEqualTo(NOW);
        assertThat(v.getVisibility()).isEqualTo(Visibility.UNLISTED);
    }

    @Test
    void removedVideoCannotBePublishedOrEdited() {
        Video v = processed();
        // Moderation sets REMOVED; reproduce that state through reflection-free path: publish then force status.
        org.springframework.test.util.ReflectionTestUtils.setField(v, "publicationStatus", PublicationStatus.REMOVED);
        assertThatThrownBy(() -> v.publish(Visibility.PUBLIC, "Drama", NOW)).extracting("code").isEqualTo("VIDEO_REMOVED");
        assertThatThrownBy(() -> v.updateMetadata("t", "", "Drama", "en", Visibility.PUBLIC, true))
                .extracting("code")
                .isEqualTo("VIDEO_REMOVED");
    }

    @Test
    void publishedVideoCannotLoseItsGenre() {
        Video v = processed();
        v.publish(Visibility.PUBLIC, "Drama", NOW);
        assertThatThrownBy(() -> v.updateMetadata("t", "", null, "en", Visibility.PUBLIC, true))
                .extracting("code")
                .isEqualTo("GENRE_REQUIRED");
    }

    @Test
    void uploadCanOnlyStartFromPendingOrFailed() {
        Video v = draft();
        v.beginUpload();
        assertThat(v.getProcessingStatus()).isEqualTo(ProcessingStatus.UPLOADING);
        assertThatThrownBy(v::beginUpload).isInstanceOf(ConflictException.class);

        v.uploadFailed();
        assertThat(v.getProcessingStatus()).isEqualTo(ProcessingStatus.FAILED);
        v.beginUpload();
        assertThat(v.getProcessingStatus()).isEqualTo(ProcessingStatus.UPLOADING);
        assertThat(v.getPublicationStatus()).isEqualTo(PublicationStatus.DRAFT);
    }

    @Test
    void abandonedUploadReturnsToPending() {
        Video v = draft();
        v.beginUpload();
        v.uploadAbandoned();
        assertThat(v.getProcessingStatus()).isEqualTo(ProcessingStatus.PENDING);
    }

    @Test
    void uploadCannotRestartOnceProcessing() {
        Video v = draft();
        v.beginUpload();
        v.processingQueued();
        assertThatThrownBy(v::beginUpload).isInstanceOf(ConflictException.class);
    }

    @Test
    void softDeleteStampsDeletedAtAndMovesToRemoved() {
        Video v = processed();
        v.publish(Visibility.PUBLIC, "Drama", NOW);
        v.softDelete(NOW.plusSeconds(60));
        assertThat(v.getDeletedAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(v.getPublicationStatus()).isEqualTo(PublicationStatus.REMOVED);
    }

    @Test
    void softDeleteCanDeleteADraftThatNeverUploaded() {
        Video v = draft();
        v.softDelete(NOW);
        assertThat(v.getDeletedAt()).isEqualTo(NOW);
        assertThat(v.getPublicationStatus()).isEqualTo(PublicationStatus.REMOVED);
    }

    // ---- trailer link (migration 0011) ----

    private Video trailerOf(UUID creatorId) {
        return Video.draft(creatorId, VideoType.TRAILER, "Beyond: Trailer", "beyond-trailer-abc12345", "", null, "en", Visibility.PRIVATE, true);
    }

    private Video readyTrailerOf(UUID creatorId) {
        Video t = trailerOf(creatorId);
        t.beginUpload();
        t.processingQueued();
        t.processingSucceeded(45, null);
        return t;
    }

    @Test
    void linkTrailerPointsTheTitleAtItsOwnTrailer() {
        Video title = draft();
        Video trailer = trailerOf(title.getCreatorId());

        title.linkTrailer(trailer);

        assertThat(title.getTrailerVideoId()).isEqualTo(trailer.getId());
    }

    @Test
    void linkTrailerAcceptsATrailerThatIsStillProcessing() {
        Video title = draft();
        Video trailer = trailerOf(title.getCreatorId());
        trailer.beginUpload();
        trailer.processingQueued();

        title.linkTrailer(trailer);

        assertThat(title.getTrailerVideoId()).isEqualTo(trailer.getId());
    }

    @Test
    void linkTrailerReplacesTheCurrentTrailer() {
        Video title = draft();
        Video first = trailerOf(title.getCreatorId());
        Video second = trailerOf(title.getCreatorId());
        title.linkTrailer(first);

        title.linkTrailer(second);

        assertThat(title.getTrailerVideoId()).isEqualTo(second.getId());
    }

    @Test
    void linkTrailerRejectsTheVideoItself() {
        Video title = draft();
        assertThatThrownBy(() -> title.linkTrailer(title)).extracting("code").isEqualTo("TRAILER_SELF_LINK");
        assertThat(title.getTrailerVideoId()).isNull();
    }

    @Test
    void linkTrailerRejectsANonTrailerVideo() {
        Video title = draft();
        Video other = Video.draft(title.getCreatorId(), VideoType.SHORT, "Other", "other-abc12345", "", null, "en", Visibility.PRIVATE, true);
        assertThatThrownBy(() -> title.linkTrailer(other))
                .isInstanceOf(BusinessRuleException.class)
                .extracting("code")
                .isEqualTo("NOT_A_TRAILER");
        assertThat(title.getTrailerVideoId()).isNull();
    }

    @Test
    void aTrailerCannotCarryATrailer() {
        Video trailer = trailerOf(UUID.randomUUID());
        Video another = trailerOf(trailer.getCreatorId());
        assertThatThrownBy(() -> trailer.linkTrailer(another)).extracting("code").isEqualTo("TRAILER_NESTING_NOT_ALLOWED");
    }

    @Test
    void linkTrailerTreatsAnotherCreatorsVideoAsNotFound() {
        Video title = draft();
        Video foreign = trailerOf(UUID.randomUUID());
        assertThatThrownBy(() -> title.linkTrailer(foreign)).extracting("code").isEqualTo("TRAILER_NOT_FOUND");
    }

    @Test
    void linkTrailerTreatsADeletedOrRemovedTrailerAsNotFound() {
        Video title = draft();
        Video deleted = trailerOf(title.getCreatorId());
        deleted.softDelete(NOW);
        assertThatThrownBy(() -> title.linkTrailer(deleted)).extracting("code").isEqualTo("TRAILER_NOT_FOUND");
    }

    @Test
    void aRemovedTitleCannotLinkATrailer() {
        Video title = draft();
        Video trailer = trailerOf(title.getCreatorId());
        title.softDelete(NOW);
        assertThatThrownBy(() -> title.linkTrailer(trailer)).extracting("code").isEqualTo("VIDEO_REMOVED");
    }

    @Test
    void unlinkTrailerClearsTheLinkAndIsHarmlessWithoutOne() {
        Video title = draft();
        title.unlinkTrailer();
        assertThat(title.getTrailerVideoId()).isNull();

        title.linkTrailer(trailerOf(title.getCreatorId()));
        title.unlinkTrailer();
        assertThat(title.getTrailerVideoId()).isNull();
    }

    @Test
    void softDeleteOfTheTitleClearsTheTrailerLink() {
        Video title = draft();
        title.linkTrailer(trailerOf(title.getCreatorId()));

        title.softDelete(NOW);

        assertThat(title.getTrailerVideoId()).isNull();
    }

    @Test
    void softDeleteOfATrailerLeavesTheParentsLinkAlone() {
        Video title = draft();
        Video trailer = trailerOf(title.getCreatorId());
        title.linkTrailer(trailer);

        trailer.softDelete(NOW);

        assertThat(title.getTrailerVideoId()).isEqualTo(trailer.getId());
        assertThat(trailer.isPlayableTrailer()).isFalse();
    }

    @Test
    void onlyAFinishedLiveTrailerIsPlayable() {
        UUID creator = UUID.randomUUID();
        assertThat(readyTrailerOf(creator).isPlayableTrailer()).isTrue();

        Video pending = trailerOf(creator);
        assertThat(pending.isPlayableTrailer()).isFalse();

        Video processing = trailerOf(creator);
        processing.beginUpload();
        processing.processingQueued();
        assertThat(processing.isPlayableTrailer()).isFalse();

        Video failed = trailerOf(creator);
        failed.beginUpload();
        failed.processingQueued();
        failed.processingFailed();
        assertThat(failed.isPlayableTrailer()).isFalse();

        Video deleted = readyTrailerOf(creator);
        deleted.softDelete(NOW);
        assertThat(deleted.isPlayableTrailer()).isFalse();

        Video notATrailer = processed();
        assertThat(notATrailer.isPlayableTrailer()).isFalse();
    }

    @Test
    void aPublishedTrailerIsStillPlayable() {
        Video trailer = readyTrailerOf(UUID.randomUUID());
        trailer.publish(Visibility.PUBLIC, "Drama", NOW);
        assertThat(trailer.isPlayableTrailer()).isTrue();
    }

    @Test
    void softDeleteIsNotIdempotent() {
        Video v = draft();
        v.softDelete(NOW);
        assertThatThrownBy(() -> v.softDelete(NOW.plusSeconds(1)))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("VIDEO_ALREADY_DELETED");
    }
}
