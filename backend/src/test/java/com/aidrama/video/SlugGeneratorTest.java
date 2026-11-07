package com.aidrama.video;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class SlugGeneratorTest {

    private static final Pattern DB_FORMAT = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");
    private final SlugGenerator generator = new SlugGenerator();

    @Test
    void matchesDatabaseSlugFormatForAwkwardTitles() {
        for (String title : new String[] {
            "Beyond the Universe", "  --  ", "Ünïcödé Tïtle!!", "日本語のタイトル", "a".repeat(300), "Hello_World -- 2026", "***"}) {
            String slug = generator.generate(title);
            assertThat(slug).matches(DB_FORMAT).hasSizeLessThanOrEqualTo(120);
        }
    }

    @Test
    void derivesReadablePrefixFromTitle() {
        assertThat(generator.generate("Beyond the Universe")).startsWith("beyond-the-universe-");
        assertThat(generator.generate("Ünïcödé")).startsWith("unicode-");
    }

    @Test
    void sameTitleGivesDifferentSlugs() {
        assertThat(generator.generate("Same")).isNotEqualTo(generator.generate("Same"));
    }

    @Test
    void slugIsNeverAUuid() {
        for (int i = 0; i < 100; i++) {
            String slug = generator.generate(UUID.randomUUID().toString());
            assertThat(slug).doesNotMatch("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
        }
    }
}
