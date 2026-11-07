package com.aidrama.upload;

import jakarta.annotation.PostConstruct;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * LOCAL DEVELOPMENT ONLY. Simulates the transcoding worker so the frontend can exercise the whole
 * flow: it claims a job and marks it READY. <b>No real transcoding happens.</b>
 *
 * <p>When the faststart step is enabled ({@code aidrama.processing.dev-stub.faststart.enabled=true}
 * and a {@link MediaRemuxer} bean is present), the stub rewrites the uploaded original with ffmpeg
 * {@code -movflags +faststart} and registers that copy as playable, so new uploads play back in the
 * browser without a real transcoder. Otherwise it registers the raw original as playable, which may
 * not play if its moov atom sits at the end of the file.
 *
 * <p>Disabled unless {@code aidrama.processing.dev-stub.enabled=true}.
 */
@Component
@ConditionalOnProperty(prefix = "aidrama.processing.dev-stub", name = "enabled", havingValue = "true")
public class DevStubProcessingWorker {

    private static final Logger log = LoggerFactory.getLogger(DevStubProcessingWorker.class);
    private static final String WORKER_ID = "dev-stub";

    private final ProcessingJobService jobs;
    private final Optional<MediaRemuxer> remuxer;

    public DevStubProcessingWorker(ProcessingJobService jobs, Optional<MediaRemuxer> remuxer) {
        this.jobs = jobs;
        this.remuxer = remuxer;
    }

    @PostConstruct
    void warn() {
        log.warn("DEV STUB PROCESSING WORKER IS ENABLED. Videos become READY without any transcoding. Never use this outside local development.");
        if (remuxer.isEmpty()) {
            log.warn("Dev stub faststart is OFF. Uploads are served as-is and may not play if their moov atom is at the end of the file. "
                    + "Set aidrama.processing.dev-stub.faststart.enabled=true (ffmpeg required) to fix this.");
        }
    }

    @Scheduled(fixedDelayString = "${aidrama.processing.dev-stub.interval:PT3S}")
    void run() {
        try {
            jobs.claimNext(WORKER_ID).ifPresent(this::process);
        } catch (OptimisticLockingFailureException ex) {
            log.debug("Dev stub lost a claim race, will retry");
        } catch (RuntimeException ex) {
            log.error("Dev stub failed", ex);
        }
    }

    private void process(ProcessingJob job) {
        jobs.reportProgress(job.getId(), 50);

        if (remuxer.isPresent()) {
            String sourceKey = jobs.sourceStorageKey(job.getId());
            try {
                String playableKey = remuxer.get().remuxToFaststart(sourceKey);
                jobs.succeedWithPlayableKey(job.getId(), 60, playableKey);
                log.info("Dev stub marked job READY (faststart): jobId={} videoId={} playableKey={}",
                        job.getId(), job.getVideoId(), playableKey);
                return;
            } catch (MediaRemuxer.RemuxException ex) {
                log.error("Dev stub faststart failed, failing job: jobId={} videoId={}", job.getId(), job.getVideoId(), ex);
                jobs.fail(job.getId(), "PROCESSING_FAILED", "Faststart remux failed: " + ex.getMessage());
                return;
            }
        }

        jobs.succeedWithOriginalAsPlayable(job.getId(), 60);
        log.info("Dev stub marked job READY (original as playable): jobId={} videoId={}", job.getId(), job.getVideoId());
    }
}
