package com.aidrama.storage;

import com.aidrama.common.exception.DependencyUnavailableException;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

/** S3 / MinIO implementation. The presigned PUT signs content type and length. */
public class S3ObjectStorage implements ObjectStorage {

    private static final Logger log = LoggerFactory.getLogger(S3ObjectStorage.class);

    private final S3Client client;
    private final S3Presigner presigner;
    private final String bucket;

    public S3ObjectStorage(S3Client client, S3Presigner presigner, String bucket) {
        this.client = client;
        this.presigner = presigner;
        this.bucket = bucket;
    }

    @Override
    public String bucket() {
        return bucket;
    }

    @Override
    public SignedUpload presignPut(String key, String contentType, long contentLength, Duration ttl) {
        PutObjectRequest put = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .contentLength(contentLength)
                .build();
        var presigned = presigner.presignPutObject(PutObjectPresignRequest.builder()
                .signatureDuration(ttl)
                .putObjectRequest(put)
                .build());
        // Browsers set Content-Length and Host themselves. Content-Type must match what was signed.
        return new SignedUpload(presigned.url().toString(), "PUT", Map.of("Content-Type", contentType));
    }

    @Override
    public Optional<StoredObject> head(String key) {
        try {
            HeadObjectResponse head = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build());
            return Optional.of(new StoredObject(head.contentLength(), head.contentType()));
        } catch (NoSuchKeyException ex) {
            return Optional.empty();
        } catch (S3Exception ex) {
            if (ex.statusCode() == 404) {
                return Optional.empty();
            }
            log.error("Object storage HEAD failed: status={} code={}", ex.statusCode(), ex.awsErrorDetails() == null ? null : ex.awsErrorDetails().errorCode());
            throw new DependencyUnavailableException("STORAGE_UNAVAILABLE", "Object storage is temporarily unavailable. Try again.");
        } catch (SdkException ex) {
            log.error("Object storage HEAD failed: {}", ex.getClass().getSimpleName());
            throw new DependencyUnavailableException("STORAGE_UNAVAILABLE", "Object storage is temporarily unavailable. Try again.");
        }
    }
}
