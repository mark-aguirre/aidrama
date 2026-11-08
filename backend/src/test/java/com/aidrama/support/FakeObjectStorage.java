package com.aidrama.support;

import com.aidrama.storage.ObjectStorage;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** In-memory storage for tests. A test "uploads" by calling {@link #put}. */
public class FakeObjectStorage implements ObjectStorage {

    private final Map<String, StoredObject> objects = new ConcurrentHashMap<>();
    private final Map<String, String> multipartUploads = new ConcurrentHashMap<>();
    private final AtomicInteger multipartCounter = new AtomicInteger();

    public void put(String key, long size, String contentType) {
        objects.put(key, new StoredObject(size, contentType));
    }

    public void clear() {
        objects.clear();
        multipartUploads.clear();
    }

    @Override
    public String bucket() {
        return "test-bucket";
    }

    @Override
    public SignedUpload presignPut(String key, String contentType, long contentLength, Duration ttl) {
        return new SignedUpload(
                "https://storage.test.invalid/test-bucket/" + key + "?X-Amz-Expires=" + ttl.toSeconds(),
                "PUT",
                Map.of("Content-Type", contentType));
    }

    @Override
    public Optional<StoredObject> head(String key) {
        return Optional.ofNullable(objects.get(key));
    }

    @Override
    public String createMultipartUpload(String key, String contentType) {
        String uploadId = "mpu-" + multipartCounter.incrementAndGet();
        multipartUploads.put(uploadId, key);
        return uploadId;
    }

    @Override
    public SignedUpload presignUploadPart(String key, String uploadId, int partNumber, Duration ttl) {
        return new SignedUpload(
                "https://storage.test.invalid/test-bucket/" + key
                        + "?uploadId=" + uploadId + "&partNumber=" + partNumber + "&X-Amz-Expires=" + ttl.toSeconds(),
                "PUT",
                Map.of());
    }

    @Override
    public void completeMultipartUpload(String key, String uploadId, List<Part> parts) {
        multipartUploads.remove(uploadId);
        // The assembled object's size is unknown to the fake; tests that verify size call put() first.
        objects.computeIfAbsent(key, k -> new StoredObject(0, "application/octet-stream"));
    }

    @Override
    public void abortMultipartUpload(String key, String uploadId) {
        multipartUploads.remove(uploadId);
    }
}
