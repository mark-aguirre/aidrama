package com.aidrama.view;

import com.aidrama.config.AppProperties;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * Builds the two opaque keys stored with a view event. Both are 64 lowercase hex characters (SHA-256 size),
 * which fits {@code varchar(64)}.
 *
 * <ul>
 *   <li>{@code viewer_key}: HMAC-SHA256 keyed with the server-side salt over a namespaced viewer id. The raw
 *       user id, session id or IP address is never stored. Namespaces keep a user id and a session id from
 *       ever colliding.
 *   <li>{@code dedupe_key}: SHA-256 over viewer key, video id, event type and the UTC day. Equal inputs give
 *       an equal key, so the partial unique index {@code uq_video_view_events_dedupe} admits one event of each
 *       type per viewer, video and UTC day.
 * </ul>
 */
@Component
public class ViewKeys {

    private static final String HMAC = "HmacSHA256";
    private static final String SEPARATOR = "|";

    private final SecretKeySpec salt;

    public ViewKeys(AppProperties props) {
        this.salt = new SecretKeySpec(props.views().salt().getBytes(StandardCharsets.UTF_8), HMAC);
    }

    /** Viewer key of a signed-in user. */
    public String forUser(UUID userId) {
        return hmac("user:" + userId);
    }

    /** Viewer key of an anonymous browser session. */
    public String forSession(String sessionId) {
        return hmac("session:" + sessionId);
    }

    /**
     * Idempotency key of one event. The event type is part of it so a {@code PLAY_START} cannot use up the
     * slot of the {@code VIEW_QUALIFIED} that follows it.
     *
     * @param day the UTC day the event falls on, the coarse de-duplication window
     */
    public String dedupeKey(String viewerKey, UUID videoId, ViewEventType type, LocalDate day) {
        String input = String.join(SEPARATOR, viewerKey, videoId.toString(), type.name(), day.toString());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private String hmac(String value) {
        try {
            // Mac is not thread-safe, so one instance per call.
            Mac mac = Mac.getInstance(HMAC);
            mac.init(salt);
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA256 is not available", ex);
        }
    }
}
