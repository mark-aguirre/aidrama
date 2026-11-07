package com.aidrama.video;

/** Values of {@code ck_videos_processing_status}. Written only by the upload and processing pipeline. */
public enum ProcessingStatus {
    PENDING,
    UPLOADING,
    PROCESSING,
    READY,
    FAILED
}

