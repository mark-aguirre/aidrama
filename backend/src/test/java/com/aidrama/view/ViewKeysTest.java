package com.aidrama.view;

import static org.assertj.core.api.Assertions.assertThat;

import com.aidrama.config.AppProperties;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ViewKeysTest {

    private static final UUID USER = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID VIDEO = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final String SESSION = "0b8f7c2e-3a41-4d5e-9f10-2c6b7d8e9a01";
    private static final LocalDate DAY = LocalDate.parse("2026-11-07");

    private static ViewKeys keysWithSalt(String salt) {
        return new ViewKeys(new AppProperties(null, null, null, null, null, null, null, new AppProperties.Views(salt, 10)));
    }

    private final ViewKeys keys = keysWithSalt("test-only-views-salt-0123456789");

    @Test
    void viewerKeysAre64LowercaseHexCharsAndNeverContainTheRawId() {
        assertThat(keys.forUser(USER)).matches("[0-9a-f]{64}").doesNotContain(USER.toString());
        assertThat(keys.forSession(SESSION)).matches("[0-9a-f]{64}").doesNotContain(SESSION);
    }

    @Test
    void viewerKeyIsStableForTheSameSaltAndChangesWithTheSalt() {
        assertThat(keys.forSession(SESSION)).isEqualTo(keys.forSession(SESSION));
        assertThat(keysWithSalt("another-salt-another-salt-9876").forSession(SESSION)).isNotEqualTo(keys.forSession(SESSION));
    }

    @Test
    void aUserIdAndASessionIdWithTheSameTextNeverShareAKey() {
        assertThat(keys.forUser(USER)).isNotEqualTo(keys.forSession(USER.toString()));
    }

    @Test
    void dedupeKeyIs64HexAndStableForTheSameInputs() {
        String viewer = keys.forSession(SESSION);
        String key = keys.dedupeKey(viewer, VIDEO, ViewEventType.VIEW_QUALIFIED, DAY);

        assertThat(key).matches("[0-9a-f]{64}").isEqualTo(keys.dedupeKey(viewer, VIDEO, ViewEventType.VIEW_QUALIFIED, DAY));
    }

    @Test
    void dedupeKeyChangesWithViewerVideoEventTypeAndDay() {
        String viewer = keys.forSession(SESSION);
        String base = keys.dedupeKey(viewer, VIDEO, ViewEventType.VIEW_QUALIFIED, DAY);

        assertThat(keys.dedupeKey(keys.forUser(USER), VIDEO, ViewEventType.VIEW_QUALIFIED, DAY)).isNotEqualTo(base);
        assertThat(keys.dedupeKey(viewer, UUID.randomUUID(), ViewEventType.VIEW_QUALIFIED, DAY)).isNotEqualTo(base);
        assertThat(keys.dedupeKey(viewer, VIDEO, ViewEventType.PLAY_START, DAY)).isNotEqualTo(base);
        assertThat(keys.dedupeKey(viewer, VIDEO, ViewEventType.VIEW_QUALIFIED, DAY.plusDays(1))).isNotEqualTo(base);
    }
}
