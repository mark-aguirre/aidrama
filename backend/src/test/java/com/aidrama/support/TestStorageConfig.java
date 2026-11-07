package com.aidrama.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** Replaces the S3 storage with an in-memory fake. The fake is {@code @Primary}, so it wins for {@code ObjectStorage} injection. */
@TestConfiguration
public class TestStorageConfig {

    @Bean
    @Primary
    FakeObjectStorage fakeObjectStorage() {
        return new FakeObjectStorage();
    }
}
