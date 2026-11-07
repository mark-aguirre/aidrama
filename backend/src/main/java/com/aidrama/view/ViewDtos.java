package com.aidrama.view;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request and response bodies for {@code POST /videos/{slug}/view-events}. */
public final class ViewDtos {

    /** Upper bound for {@code watchedSeconds}: one day. Rejects absurd values before they reach the database. */
    static final int MAX_WATCHED_SECONDS = 86_400;

    private ViewDtos() {}

    /**
     * @param eventType what happened
     * @param watchedSeconds seconds of the video watched so far in this playback, 0 to 86400
     * @param sessionId anonymous viewers only: a random id the client generates once per browser and keeps
     *     (for example {@code crypto.randomUUID()} in localStorage). Ignored for signed-in callers, whose
     *     identity comes from the bearer token. It is hashed with a server-side salt and never stored raw.
     */
    public record RecordViewRequest(
            @NotNull ViewEventType eventType,
            @NotNull @Min(0) @Max(MAX_WATCHED_SECONDS) Integer watchedSeconds,
            @Size(min = 16, max = 64) @Pattern(regexp = "^[A-Za-z0-9_-]+$", message = "may contain only letters, digits, - and _")
                    String sessionId) {}

    /**
     * @param recorded true when a new event row was stored, false when it was a duplicate within the
     *     de-duplication window or below the watch-time threshold
     * @param counted true when this call incremented the video's {@code viewCount}
     */
    public record RecordViewResponse(boolean recorded, boolean counted) {}
}
