package com.aidrama.storage;

import com.aidrama.config.AppProperties;
import java.net.URI;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3 client wiring. Static credentials are used only when both key id and secret are provided
 * through the environment; otherwise the AWS default credential chain applies (IAM role, profile).
 */
@Configuration
public class StorageConfig {

    @Bean(destroyMethod = "close")
    S3Client s3Client(AppProperties props) {
        AppProperties.Storage s = props.storage();
        var builder = S3Client.builder()
                .region(Region.of(s.region()))
                .credentialsProvider(credentials(s))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(s.pathStyle()).build())
                .overrideConfiguration(ClientOverrideConfiguration.builder()
                        .apiCallTimeout(Duration.ofSeconds(10))
                        .apiCallAttemptTimeout(Duration.ofSeconds(5))
                        .build());
        if (StringUtils.hasText(s.endpoint())) {
            builder.endpointOverride(URI.create(s.endpoint()));
        }
        return builder.build();
    }

    @Bean(destroyMethod = "close")
    S3Presigner s3Presigner(AppProperties props) {
        AppProperties.Storage s = props.storage();
        var builder = S3Presigner.builder()
                .region(Region.of(s.region()))
                .credentialsProvider(credentials(s))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(s.pathStyle()).build());
        if (StringUtils.hasText(s.endpoint())) {
            builder.endpointOverride(URI.create(s.endpoint()));
        }
        return builder.build();
    }

    @Bean
    ObjectStorage objectStorage(S3Client client, S3Presigner presigner, AppProperties props) {
        return new S3ObjectStorage(client, presigner, props.storage().bucket());
    }

    private static AwsCredentialsProvider credentials(AppProperties.Storage s) {
        if (StringUtils.hasText(s.accessKeyId()) && StringUtils.hasText(s.secretAccessKey())) {
            return StaticCredentialsProvider.create(AwsBasicCredentials.create(s.accessKeyId(), s.secretAccessKey()));
        }
        return DefaultCredentialsProvider.builder().build();
    }
}
