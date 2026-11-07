package com.aidrama.upload;

import com.aidrama.common.exception.NotFoundException;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.upload.UploadDtos.Failure;
import com.aidrama.upload.UploadDtos.ProcessingStatusResponse;
import com.aidrama.user.Role;
import com.aidrama.video.ProcessingStatus;
import com.aidrama.video.Video;
import com.aidrama.video.VideoRepository;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reports where a video is in the upload and processing pipeline, and why it failed (spec 3.7). */
@Service
public class ProcessingStatusService {

    private final VideoRepository videos;
    private final ProcessingJobRepository jobs;
    private final UploadSessionRepository sessions;

    public ProcessingStatusService(VideoRepository videos, ProcessingJobRepository jobs, UploadSessionRepository sessions) {
        this.videos = videos;
        this.jobs = jobs;
        this.sessions = sessions;
    }

    /** Owner-only. Another creator's video is reported as 404. */
    @Transactional(readOnly = true)
    public ProcessingStatusResponse forOwner(AuthenticatedUser caller, UUID videoId) {
        caller.require(Role.CREATOR);
        Video video = videos.findByIdAndCreatorIdAndDeletedAtIsNull(videoId, caller.id())
                .orElseThrow(() -> new NotFoundException("Video"));
        return of(video);
    }

    /** Builds the status of a video the caller is already authorized to see. Performs no ownership check. */
    public ProcessingStatusResponse of(Video video) {
        Optional<ProcessingJob> job = jobs.findFirstByVideoIdOrderByCreatedAtDesc(video.getId());
        Failure failure = null;
        if (video.getProcessingStatus() == ProcessingStatus.FAILED) {
            failure = job.filter(j -> j.getStatus() == JobStatus.FAILED)
                    .map(j -> new Failure(j.getFailureCode(), j.getFailureMessage()))
                    .or(() -> sessions.findFirstByVideoIdOrderByCreatedAtDesc(video.getId())
                            .filter(s -> s.getStatus() == UploadStatus.FAILED)
                            .map(s -> new Failure(s.getFailureCode(), s.getFailureMessage())))
                    .orElse(null);
        }
        int progress = switch (video.getProcessingStatus()) {
            case READY -> 100;
            case PROCESSING -> job.map(j -> (int) j.getProgressPercent()).orElse(0);
            default -> 0;
        };
        return new ProcessingStatusResponse(
                video.getId(),
                video.getProcessingStatus(),
                video.getPublicationStatus(),
                job.map(ProcessingJob::getStatus).orElse(null),
                progress,
                failure,
                video.getUpdatedAt());
    }
}

