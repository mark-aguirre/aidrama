package com.aidrama.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/** Presigning is a local computation, so this checks the real SDK output without any network. */
class S3PresignTest {

    @Test
    void presignedPutSignsMethodContentTypeAndLengthAndExpires() {
        var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create("AKIATESTTESTTESTTEST", "secret-secret-secret"));
        var s3Config = S3Configuration.builder().pathStyleAccessEnabled(true).build();
        try (S3Client client = S3Client.builder()
                        .region(Region.US_EAST_1)
                        .credentialsProvider(credentials)
                        .endpointOverride(URI.create("http://localhost:9000"))
                        .serviceConfiguration(s3Config)
                        .build();
                S3Presigner presigner = S3Presigner.builder()
                        .region(Region.US_EAST_1)
                        .credentialsProvider(credentials)
                        .endpointOverride(URI.create("http://localhost:9000"))
                        .serviceConfiguration(s3Config)
                        .build()) {
            S3ObjectStorage storage = new S3ObjectStorage(client, presigner, "aidrama-media");

            ObjectStorage.SignedUpload signed = storage.presignPut("videos/abc/original/s1.mp4", "video/mp4", 12345L, Duration.ofMinutes(30));

            String url = URLDecoder.decode(signed.url(), StandardCharsets.UTF_8);
            assertThat(signed.method()).isEqualTo("PUT");
            assertThat(signed.headers()).containsEntry("Content-Type", "video/mp4");
            assertThat(url).startsWith("http://localhost:9000/aidrama-media/videos/abc/original/s1.mp4?");
            assertThat(url).contains("X-Amz-Expires=1800").contains("X-Amz-Signature=").contains("X-Amz-Algorithm=AWS4-HMAC-SHA256");
            assertThat(url).containsPattern("X-Amz-SignedHeaders=[^&]*content-type");
            assertThat(url).containsPattern("X-Amz-SignedHeaders=[^&]*content-length");
            // The secret key never appears in the URL.
            assertThat(url).doesNotContain("secret-secret-secret");
        }
    }
}
