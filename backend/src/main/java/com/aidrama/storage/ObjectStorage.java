package com.aidrama.storage;

import java.time.Duration;
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

    /** A signed upload target. The client must send {@code headers} with the request. */
    record SignedUpload(String url, String method, Map<String, String> headers) {}

    /** Metadata of a stored object. */
    record StoredObject(long sizeBytes, String contentType) {}
}
