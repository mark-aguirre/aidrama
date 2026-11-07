package com.aidrama.series;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SeasonRepository extends JpaRepository<Season, UUID> {

    List<Season> findBySeriesIdAndDeletedAtIsNull(UUID seriesId);

    /** Season number per season id, in one query, for ordering episodes. */
    @Query("select s from Season s where s.id in :ids")
    List<Season> findAllByIdIn(@Param("ids") Collection<UUID> ids);

    /** Live seasons per series: rows of (seriesId, count). */
    @Query("select s.seriesId, count(s) from Season s where s.seriesId in :seriesIds and s.deletedAt is null group by s.seriesId")
    List<Object[]> countLiveBySeries(@Param("seriesIds") Collection<UUID> seriesIds);
}
