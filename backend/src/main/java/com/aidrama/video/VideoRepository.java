package com.aidrama.video;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface VideoRepository extends JpaRepository<Video, UUID>, JpaSpecificationExecutor<Video> {

    Optional<Video> findBySlugAndDeletedAtIsNull(String slug);

    /**
     * Public episode count per series: rows of (seriesId, count). Counts only episodes that are
     * PUBLISHED, PUBLIC and not deleted. Callers pass series that already passed the series predicate.
     */
    @Query("""
            select v.seriesId, count(v) from Video v
            where v.seriesId in :seriesIds and v.type = com.aidrama.video.VideoType.EPISODE
              and v.publicationStatus = com.aidrama.video.PublicationStatus.PUBLISHED
              and v.visibility = com.aidrama.video.Visibility.PUBLIC and v.deletedAt is null
            group by v.seriesId
            """)
    List<Object[]> countPublicEpisodesBySeries(@Param("seriesIds") Collection<UUID> seriesIds);

    /** Ownership is part of the lookup, so a caller can never load another creator's video. */
    Optional<Video> findByIdAndCreatorIdAndDeletedAtIsNull(UUID id, UUID creatorId);

    /** Live videos among {@code ids}, in one query. Used to resolve the trailers of a page of titles. */
    List<Video> findByIdInAndDeletedAtIsNull(Collection<UUID> ids);

    /**
     * True when another video already links {@code trailerVideoId}. Deliberately not filtered on
     * deleted_at: it mirrors the partial unique index {@code uq_videos_trailer_video}, which covers every row.
     */
    boolean existsByTrailerVideoIdAndIdNot(UUID trailerVideoId, UUID id);

    /**
     * Atomic {@code view_count = view_count + 1}. A bulk update on purpose: it is not a read-modify-write,
     * so concurrent views cannot lose increments, and it leaves {@code @Version} alone, so a view never
     * makes a creator's edit fail with a stale version. Callers run it in the transaction that inserted the
     * view event. Returns the number of rows updated.
     */
    @Modifying
    @Query("update Video v set v.viewCount = v.viewCount + 1 where v.id = :id")
    int incrementViewCount(@Param("id") UUID id);

    /**
     * Atomic {@code like_count = like_count + 1}, same pattern as {@link #incrementViewCount}: a bulk update,
     * not a read-modify-write, that leaves {@code @Version} alone. Callers run it in the transaction that
     * inserted the {@code video_likes} row, and only when that insert wrote a row.
     */
    @Modifying
    @Query("update Video v set v.likeCount = v.likeCount + 1 where v.id = :id")
    int incrementLikeCount(@Param("id") UUID id);

    /**
     * Atomic {@code like_count = like_count - 1}, only while the count is above zero, so a count that has
     * drifted can never hit the {@code like_count >= 0} CHECK constraint. Callers run it in the transaction
     * that deleted the {@code video_likes} row, and only when that delete removed a row.
     */
    @Modifying
    @Query("update Video v set v.likeCount = v.likeCount - 1 where v.id = :id and v.likeCount > 0")
    int decrementLikeCount(@Param("id") UUID id);

    /** The current stored like count. A scalar query, so it reads the database and not the persistence context. */
    @Query("select v.likeCount from Video v where v.id = :id")
    Optional<Long> findLikeCountById(@Param("id") UUID id);
}
