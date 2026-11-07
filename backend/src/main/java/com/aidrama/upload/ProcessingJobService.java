package com.aidrama.upload;

import com.aidrama.common.exception.NotFoundException;
import com.aidrama.storage.ObjectStorage;
import com.aidrama.video.AssetType;
import com.aidrama.video.ProcessingStatus;
import com.aidrama.video.Video;
import com.aidrama.video.VideoAsset;
import com.aidrama.video.VideoAssetRepository;
import com.aidrama.video.VideoRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * State transitions of processing jobs, used by the transcoding worker (spec 3.8). Each method is
 * one short transaction. This is the only place that moves a video from PROCESSING to READY or FAILED.
 *
 * <p>The worker itself (FFmpeg) is outside this slice. It claims a job, reports progress, then
 * calls {@link #succeed} with the keys of the objects it wrote, or {@link #fail}. A failed job is not
 * retried automatically: the creator uploads again, which creates a fresh job.
 */
@Service
public class ProcessingJobService {

    private static final String HLS_MIME = "application/vnd.apple.mpegurl";

    private final ProcessingJobRepository jobs;
    private final VideoRepository videos;
    private final VideoAssetRepository assets;
    private final ObjectStorage storage;
    private final Clock clock;

    public ProcessingJobService(
            ProcessingJobRepository jobs, VideoRepository videos, VideoAssetRepository assets, ObjectStorage storage, Clock clock) {
        this.jobs = jobs;
        this.videos = videos;
        this.assets = assets;
        this.storage = storage;
        this.clock = clock;
    }

    /** Claims the oldest runnable job. A concurrent claim by another worker fails with an optimistic lock error. */
    @Transactional
    public Optional<ProcessingJob> claimNext(String workerId) {
        Instant now = Instant.now(clock);
        return jobs.findRunnable(now, PageRequest.of(0, 1)).stream().findFirst().map(job -> {
            job.start(workerId, now);
            return jobs.saveAndFlush(job);
        });
    }

    @Transactional
    public void reportProgress(UUID jobId, int percent) {
        ProcessingJob job = jobs.findById(jobId).orElseThrow(() -> new NotFoundException("Processing job"));
        job.reportProgress(percent, Instant.now(clock));
        jobs.saveAndFlush(job);
    }

    /**
     * Marks the job and video READY and registers the HLS master playlist (and optional thumbnail).
     * After this the creator may publish the video.
     */
    @Transactional
    public void succeed(UUID jobId, Integer durationSeconds, String hlsMasterKey, String thumbnailKey) {
        Instant now = Instant.now(clock);
        ProcessingJob job = jobs.findById(jobId).orElseThrow(() -> new NotFoundException("Processing job"));
        Video video = videos.findById(job.getVideoId()).orElseThrow(() -> new NotFoundException("Video"));

        assets.saveAndFlush(VideoAsset.create(
                video.getId(), AssetType.HLS_MASTER, ProcessingStatus.READY, storage.bucket(), hlsMasterKey, HLS_MIME, null));
        UUID thumbnailId = null;
        if (thumbnailKey != null) {
            thumbnailId = assets.saveAndFlush(VideoAsset.create(
                            video.getId(), AssetType.THUMBNAIL, ProcessingStatus.READY, storage.bucket(), thumbnailKey, "image/jpeg", null))
                    .getId();
        }
        job.succeed(now);
        jobs.saveAndFlush(job);
        video.processingSucceeded(durationSeconds, thumbnailId);
        videos.saveAndFlush(video);
    }

    /**
     * LOCAL DEV ONLY. Marks the job and video READY by registering the already-uploaded ORIGINAL
     * object as the playable asset, instead of a transcoded HLS playlist that was never produced.
     * Used by {@link DevStubProcessingWorker} so an uploaded file is actually playable without a
     * real transcoder. The registered HLS_MASTER asset keeps the original object's own key and MIME
     * type (e.g. video/mp4), which the frontend player handles as plain progressive playback.
     */
    @Transactional
    public void succeedWithOriginalAsPlayable(UUID jobId, Integer durationSeconds) {
        markPlayable(jobId, durationSeconds, null);
    }

    /**
     * LOCAL DEV ONLY. Like {@link #succeedWithOriginalAsPlayable}, but registers a specific object
     * key as playable (for example the faststart-remuxed copy produced by {@link MediaRemuxer})
     * rather than the raw original. The asset is stored as {@code video/mp4} progressive media.
     */
    @Transactional
    public void succeedWithPlayableKey(UUID jobId, Integer durationSeconds, String playableKey) {
        markPlayable(jobId, durationSeconds, playableKey);
    }

    /** Storage key of a job's source (ORIGINAL) asset, so a worker can fetch it for processing. */
    @Transactional(readOnly = true)
    public String sourceStorageKey(UUID jobId) {
        ProcessingJob job = jobs.findById(jobId).orElseThrow(() -> new NotFoundException("Processing job"));
        return assets.findById(job.getSourceAssetId())
                .orElseThrow(() -> new NotFoundException("Source asset"))
                .getStorageKey();
    }

    private void markPlayable(UUID jobId, Integer durationSeconds, String playableKeyOrNull) {
        Instant now = Instant.now(clock);
        ProcessingJob job = jobs.findById(jobId).orElseThrow(() -> new NotFoundException("Processing job"));
        Video video = videos.findById(job.getVideoId()).orElseThrow(() -> new NotFoundException("Video"));
        VideoAsset original = assets.findById(job.getSourceAssetId())
                .orElseThrow(() -> new NotFoundException("Source asset"));

        String key = playableKeyOrNull != null ? playableKeyOrNull : original.getStorageKey();
        Long sizeBytes = playableKeyOrNull != null ? null : original.getSizeBytes();

        assets.saveAndFlush(VideoAsset.create(
                video.getId(), AssetType.HLS_MASTER, ProcessingStatus.READY,
                original.getStorageBucket(), key, "video/mp4", sizeBytes));
        job.succeed(now);
        jobs.saveAndFlush(job);
        video.processingSucceeded(durationSeconds, null);
        videos.saveAndFlush(video);
    }

    @Transactional
    public void fail(UUID jobId, String code, String message) {
        Instant now = Instant.now(clock);
        ProcessingJob job = jobs.findById(jobId).orElseThrow(() -> new NotFoundException("Processing job"));
        Video video = videos.findById(job.getVideoId()).orElseThrow(() -> new NotFoundException("Video"));
        job.fail(code, message, now);
        jobs.saveAndFlush(job);
        video.processingFailed();
        videos.saveAndFlush(video);
    }
}
