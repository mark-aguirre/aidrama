package com.aidrama.view;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.aidrama.common.exception.ApiException;
import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.config.AppProperties;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.user.Role;
import com.aidrama.video.Video;
import com.aidrama.video.VideoRepository;
import com.aidrama.video.VideoType;
import com.aidrama.video.Visibility;
import com.aidrama.view.ViewDtos.RecordViewRequest;
import com.aidrama.view.ViewDtos.RecordViewResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.jpa.domain.Specification;

/**
 * Counting rules of {@link ViewService} with the repositories mocked. The SQL itself (ON CONFLICT with the
 * partial-index predicate) is covered by {@code ViewCountingIT}, which needs Docker.
 */
class ViewServiceTest {

    private static final String SLUG = "beyond-abc12345";
    private static final String SESSION = "0b8f7c2e-3a41-4d5e-9f10-2c6b7d8e9a01";
    private static final int THRESHOLD = 10;

    private final VideoRepository videos = mock(VideoRepository.class);
    private final VideoViewEventRepository events = mock(VideoViewEventRepository.class);
    private final AppProperties props = new AppProperties(
            null, null, null, null, null, null, null, new AppProperties.Views("test-only-views-salt-0123456789", THRESHOLD));
    private final ViewKeys keys = new ViewKeys(props);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-07T23:59:59Z"), ZoneOffset.UTC);
    private final ViewService service = new ViewService(videos, events, keys, clock, props);

    private Video video;

    @BeforeEach
    void setUp() {
        video = Video.draft(UUID.randomUUID(), VideoType.MOVIE, "Beyond", SLUG, "", "Drama", "en", Visibility.PUBLIC, true);
        when(videos.findOne(anySpec())).thenReturn(Optional.of(video));
    }

    @SuppressWarnings("unchecked")
    private static Specification<Video> anySpec() {
        return any(Specification.class);
    }

    private static RecordViewRequest request(ViewEventType type, int watched) {
        return new RecordViewRequest(type, watched, SESSION);
    }

    private void insertReturns(boolean inserted) {
        when(events.insertIfAbsent(any(), any(), anyString(), any(), anyInt(), anyString())).thenReturn(inserted);
    }

    // ---- (a) a qualified view is stored and counted once ----

    @Test
    void qualifiedViewInsertsTheEventAndBumpsTheCounterByExactlyOne() {
        insertReturns(true);

        RecordViewResponse result = service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, THRESHOLD), null);

        assertThat(result).isEqualTo(new RecordViewResponse(true, true));
        verify(events).insertIfAbsent(eq(video.getId()), isNull(), anyString(), eq(ViewEventType.VIEW_QUALIFIED), eq(THRESHOLD), anyString());
        verify(videos, org.mockito.Mockito.times(1)).incrementViewCount(video.getId());
    }

    @Test
    void thresholdIsInclusiveAndOneSecondLessDoesNotCount() {
        insertReturns(true);

        assertThat(service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, THRESHOLD + 1), null).counted()).isTrue();
        assertThat(service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, THRESHOLD - 1), null).counted()).isFalse();
        verify(videos, org.mockito.Mockito.times(1)).incrementViewCount(video.getId());
    }

    // ---- (b) a duplicate in the same window changes nothing ----

    @Test
    void duplicateInTheSameWindowInsertsNothingAndDoesNotBump() {
        insertReturns(false);

        RecordViewResponse result = service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, 30), null);

        assertThat(result).isEqualTo(new RecordViewResponse(false, false));
        verify(videos, never()).incrementViewCount(any());
    }

    @Test
    void sameViewerVideoTypeAndDayProduceTheSameDedupeKey() {
        insertReturns(true);
        ArgumentCaptor<String> dedupe = ArgumentCaptor.forClass(String.class);

        service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, 12), null);
        service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, 95), null);

        verify(events, org.mockito.Mockito.times(2))
                .insertIfAbsent(any(), any(), anyString(), any(), anyInt(), dedupe.capture());
        assertThat(dedupe.getAllValues().get(0)).isEqualTo(dedupe.getAllValues().get(1)).hasSize(64);
    }

    // ---- (c) events that must never bump ----

    @Test
    void playStartIsStoredButNeverCounts() {
        insertReturns(true);

        RecordViewResponse result = service.record(SLUG, request(ViewEventType.PLAY_START, 0), null);

        assertThat(result).isEqualTo(new RecordViewResponse(true, false));
        verify(videos, never()).incrementViewCount(any());
    }

    @Test
    void playCompleteIsStoredButNeverCountsEvenAboveTheThreshold() {
        insertReturns(true);

        RecordViewResponse result = service.record(SLUG, request(ViewEventType.PLAY_COMPLETE, 600), null);

        assertThat(result).isEqualTo(new RecordViewResponse(true, false));
        verify(videos, never()).incrementViewCount(any());
    }

    @Test
    void belowThresholdQualifiedEventIsNotStoredAndNotCounted() {
        RecordViewResponse result = service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, THRESHOLD - 1), null);

        assertThat(result).isEqualTo(new RecordViewResponse(false, false));
        verifyNoInteractions(events);
        verify(videos, never()).incrementViewCount(any());
    }

    // ---- (d) unknown or hidden video ----

    @Test
    void unknownOrHiddenVideoIsA404AndWritesNothing() {
        when(videos.findOne(anySpec())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.record("nope", request(ViewEventType.VIEW_QUALIFIED, 30), null))
                .isInstanceOf(NotFoundException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus().value()).isEqualTo(404));
        verifyNoInteractions(events);
        verify(videos, never()).incrementViewCount(any());
    }

    // ---- viewer identity ----

    @Test
    void anonymousViewerWithoutASessionIdIsA400NamingTheField() {
        RecordViewRequest noSession = new RecordViewRequest(ViewEventType.VIEW_QUALIFIED, 30, null);

        assertThatThrownBy(() -> service.record(SLUG, noSession, null))
                .isInstanceOf(BadRequestException.class)
                .satisfies(e -> assertThat(((ApiException) e).getDetails().getFirst().field()).isEqualTo("sessionId"));
        verifyNoInteractions(events);
    }

    @Test
    void signedInViewerIsIdentifiedByTheTokenNotTheBodySessionId() {
        insertReturns(true);
        UUID userId = UUID.randomUUID();
        AuthenticatedUser user = new AuthenticatedUser(userId, Set.of(Role.USER));
        ArgumentCaptor<String> viewerKey = ArgumentCaptor.forClass(String.class);

        service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, 30), user);

        verify(events).insertIfAbsent(eq(video.getId()), eq(userId), viewerKey.capture(), any(), anyInt(), anyString());
        assertThat(viewerKey.getValue()).isEqualTo(keys.forUser(userId)).isNotEqualTo(keys.forSession(SESSION));
    }

    @Test
    void anonymousViewerIsStoredWithoutAUserIdAndOnlyAsAHash() {
        insertReturns(true);
        ArgumentCaptor<String> viewerKey = ArgumentCaptor.forClass(String.class);

        service.record(SLUG, request(ViewEventType.PLAY_START, 0), null);

        verify(events).insertIfAbsent(any(), isNull(), viewerKey.capture(), any(), anyInt(), anyString());
        assertThat(viewerKey.getValue()).hasSize(64).doesNotContain(SESSION).isEqualTo(keys.forSession(SESSION));
    }

    @Test
    void theDedupeWindowIsTheUtcDay() {
        insertReturns(true);
        ArgumentCaptor<String> dedupe = ArgumentCaptor.forClass(String.class);

        service.record(SLUG, request(ViewEventType.VIEW_QUALIFIED, 30), null);

        verify(events).insertIfAbsent(any(), any(), anyString(), any(), anyInt(), dedupe.capture());
        String viewerKey = keys.forSession(SESSION);
        assertThat(dedupe.getValue()).isEqualTo(
                keys.dedupeKey(viewerKey, video.getId(), ViewEventType.VIEW_QUALIFIED, java.time.LocalDate.parse("2026-11-07")));
    }
}
