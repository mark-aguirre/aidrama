package com.aidrama.video;

import java.security.SecureRandom;
import java.text.Normalizer;
import java.util.Locale;
import org.springframework.stereotype.Component;

/**
 * Builds URL slugs matching {@code ^[a-z0-9]+(-[a-z0-9]+)*$} (max 120). A random 8-character
 * suffix keeps slugs unique without a lookup, and guarantees a slug can never equal a UUID.
 */
@Component
public class SlugGenerator {

    private static final int MAX_BASE_LENGTH = 100;
    private static final char[] ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789".toCharArray();
    private final SecureRandom random = new SecureRandom();

    public String generate(String title) {
        String base = Normalizer.normalize(title, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (base.length() > MAX_BASE_LENGTH) {
            base = base.substring(0, MAX_BASE_LENGTH).replaceAll("-+$", "");
        }
        if (base.isEmpty()) {
            base = "video";
        }
        return base + "-" + suffix(8);
    }

    private String suffix(int length) {
        char[] out = new char[length];
        for (int i = 0; i < length; i++) {
            out[i] = ALPHABET[random.nextInt(ALPHABET.length)];
        }
        return new String(out);
    }
}
