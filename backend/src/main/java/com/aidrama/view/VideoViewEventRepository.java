package com.aidrama.view;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/**
 * Append-only writes to {@code video_view_events}. Native SQL on purpose: the table has no entity (rows are
 * never read or updated by the application), and {@code ON CONFLICT} has no JPQL equivalent. Runs in the
 * caller's transaction, so the insert and the counter bump commit or roll back together.
 */
@Repository
public class VideoViewEventRepository {

    // The conflict target must repeat the predicate of the partial unique index uq_video_view_events_dedupe.
    // %s is a fixed fragment chosen below ("NULL" or ":viewerUserId"), never user input. An anonymous viewer
    // uses a literal NULL so no untyped null parameter has to be bound to a uuid column.
    private static final String INSERT_IF_ABSENT = """
            INSERT INTO video_view_events
                (id, video_id, viewer_user_id, viewer_key, event_type, watched_seconds, dedupe_key)
            VALUES
                (:id, :videoId, %s, :viewerKey, :eventType, :watchedSeconds, :dedupeKey)
            ON CONFLICT (video_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
            """;
    private static final String ANONYMOUS_VIEWER = INSERT_IF_ABSENT.formatted("NULL");
    private static final String SIGNED_IN_VIEWER = INSERT_IF_ABSENT.formatted(":viewerUserId");

    private final EntityManager em;

    public VideoViewEventRepository(EntityManager em) {
        this.em = em;
    }

    /**
     * Stores the event unless one with the same {@code (videoId, dedupeKey)} exists.
     *
     * @param viewerUserId the signed-in viewer, or null for an anonymous one
     * @return true when a row was inserted, false when the dedupe key already existed (nothing written)
     */
    public boolean insertIfAbsent(
            UUID videoId, UUID viewerUserId, String viewerKey, ViewEventType type, int watchedSeconds, String dedupeKey) {
        Query insert = em.createNativeQuery(viewerUserId == null ? ANONYMOUS_VIEWER : SIGNED_IN_VIEWER)
                .setParameter("id", UUID.randomUUID())
                .setParameter("videoId", videoId)
                .setParameter("viewerKey", viewerKey)
                .setParameter("eventType", type.name())
                .setParameter("watchedSeconds", watchedSeconds)
                .setParameter("dedupeKey", dedupeKey);
        if (viewerUserId != null) {
            insert.setParameter("viewerUserId", viewerUserId);
        }
        return insert.executeUpdate() == 1;
    }
}
