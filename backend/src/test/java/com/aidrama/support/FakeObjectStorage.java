package com.aidrama.support;

import com.aidrama.storage.ObjectStorage;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** In-memory storage for tests. A test "uploads" by calling {@link #put}. */
public class FakeObjectStorage implements ObjectStorage {

    private final Map<String, StoredObject> objects = new ConcurrentHashMap<>();

    public void put(String key, long size, String contentType) {
        objects.put(key, new StoredObject(size, contentType));
    }

    public void clear() {
        objects.clear();
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
}
