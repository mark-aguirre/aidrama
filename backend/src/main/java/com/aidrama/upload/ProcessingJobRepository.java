package com.aidrama.upload;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProcessingJobRepository extends JpaRepository<ProcessingJob, UUID> {

    /** Latest job of a video, for the status endpoint. */
    Optional<ProcessingJob> findFirstByVideoIdOrderByCreatedAtDesc(UUID videoId);

    /** Runnable jobs, oldest first. The caller locks the row before changing it. */
    @Query("select j from ProcessingJob j where j.status = com.aidrama.upload.JobStatus.PENDING and j.runAfter <= :now order by j.runAfter, j.id")
    List<ProcessingJob> findRunnable(@Param("now") Instant now, Pageable limit);

}

