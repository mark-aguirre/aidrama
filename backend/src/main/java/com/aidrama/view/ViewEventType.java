package com.aidrama.view;

/**
 * Playback events the client may report. Names match the {@code ck_video_view_events_type} CHECK constraint.
 * Only {@link #VIEW_QUALIFIED} can increment a video's view count, and only above the watch-time threshold.
 */
public enum ViewEventType {
    PLAY_START,
    VIEW_QUALIFIED,
    PLAY_COMPLETE
}
