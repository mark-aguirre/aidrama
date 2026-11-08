package com.aidrama.storage;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** The object storage operations the API needs. Implemented for S3-compatible stores. */
public interface ObjectStorage {

    /** Name of the bucket this API writes to. */
    String bucket();

    /**
     * Creates a time-limited URL for a single PUT of exactly {@code contentLength} bytes of
     * {@code contentType}. Signing is local and makes no network call.
     */
    SignedUpload presignPut(String key, String contentType, long contentLength, Duration ttl);

    /** Looks up object metadata. Empty when the object does not exist. */
    Optional<StoredObject> head(String key);

    /**
     * Starts an S3 multipart upload and returns its id. The id is needed to presign parts and to
     * complete or abort the upload. Makes a network call.
     */
    String createMultipartUpload(String key, String contentType);

    /**
     * Creates a time-limited URL for a single {@code PUT} of one part (1-based {@code partNumber})
     * of the multipart upload {@code uploadId}. Signing is local and makes no network call. The
     * browser sends the part bytes and reads the {@code ETag} response header.
     */
    SignedUpload presignUploadPart(String key, String uploadId, int partNumber, Duration ttl);

    /**
     * Finishes a multipart upload by assembling its parts in order. {@code parts} must list every
     * uploaded part with the {@code ETag} the storage returned for it. Makes a network call.
     */
    void completeMultipartUpload(String key, String uploadId, List<Part> parts);

    /** Discards an in-progress multipart upload and any parts already stored. Best effort. */
    void abortMultipartUpload(String key, String uploadId);

    /** A signed upload target. The client must send {@code headers} with the request. */
    record SignedUpload(String url, String method, Map<String, String> headers) {}

    /** Metadata of a stored object. */
    record StoredObject(long sizeBytes, String contentType) {}

    /** One finished part of a multipart upload: its 1-based number and the storage-returned ETag. */
    record Part(int partNumber, String eTag) {}
}
