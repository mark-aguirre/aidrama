package com.aidrama.like;

import jakarta.persistence.EntityManager;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Repository;

/**
 * Writes and reads {@code video_likes}. Native SQL on purpose, like the view events: the table has no entity
 * (rows are never updated), and {@code ON CONFLICT} has no JPQL equivalent. Every method runs in the caller's
 * transaction, so a row change and the {@code videos.like_count} adjustment commit or roll back together.
 */
@Repository
public class VideoLikeRepository {

    private static final String INSERT_IF_ABSENT = """
            INSERT INTO video_likes (id, video_id, user_id)
            VALUES (:id, :videoId, :userId)
            ON CONFLICT (video_id, user_id) DO NOTHING
            """;
    private static final String DELETE = "DELETE FROM video_likes WHERE video_id = :videoId AND user_id = :userId";
    private static final String LIKED_AMONG =
            "SELECT video_id FROM video_likes WHERE user_id = :userId AND video_id IN (:videoIds)";

    private final EntityManager em;

    public VideoLikeRepository(EntityManager em) {
        this.em = em;
    }

    /** @return true when a row was inserted, false when this user already liked the video (nothing written) */
    public boolean insertIfAbsent(UUID videoId, UUID userId) {
        return em.createNativeQuery(INSERT_IF_ABSENT)
                        .setParameter("id", UUID.randomUUID())
                        .setParameter("videoId", videoId)
                        .setParameter("userId", userId)
                        .executeUpdate()
                == 1;
    }

    /** @return true when a row was deleted, false when this user had not liked the video (nothing written) */
    public boolean delete(UUID videoId, UUID userId) {
        return em.createNativeQuery(DELETE)
                        .setParameter("videoId", videoId)
                        .setParameter("userId", userId)
                        .executeUpdate()
                == 1;
    }

    /**
     * The subset of {@code videoIds} that {@code userId} has liked, in one query. Pass a page of videos,
     * never an unbounded collection.
     */
    public Set<UUID> findLikedVideoIds(UUID userId, Collection<UUID> videoIds) {
        if (videoIds.isEmpty()) {
            return Set.of();
        }
        List<?> rows = em.createNativeQuery(LIKED_AMONG)
                .setParameter("userId", userId)
                .setParameter("videoIds", videoIds)
                .getResultList();
        Set<UUID> liked = new HashSet<>();
        for (Object row : rows) {
            liked.add(row instanceof UUID id ? id : UUID.fromString(row.toString()));
        }
        return liked;
    }
}
