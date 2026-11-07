package com.aidrama.video;

import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.config.AppProperties;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Allowed genres (spec 3.15) until a genres table exists. Matching ignores case and the stored
 * value is the canonical spelling, so filters never fragment ("science fiction" becomes "Science Fiction").
 */
@Component
public class GenreCatalog {

    private final Map<String, String> canonicalByLowercase;

    public GenreCatalog(AppProperties props) {
        this.canonicalByLowercase = props.catalog().genres().stream()
                .collect(Collectors.toMap(g -> g.toLowerCase(Locale.ROOT), Function.identity()));
    }

    /** For filters: canonical spelling when known, the input unchanged otherwise (which matches nothing). */
    public String forFilter(String genre) {
        if (genre == null || genre.isBlank()) {
            return null;
        }
        return canonicalByLowercase.getOrDefault(genre.trim().toLowerCase(Locale.ROOT), genre.trim());
    }

    /** Returns the canonical genre, or {@code null} for a blank input. Throws 400 for an unknown genre. */
    public String normalize(String genre) {
        if (genre == null || genre.isBlank()) {
            return null;
        }
        String canonical = canonicalByLowercase.get(genre.trim().toLowerCase(Locale.ROOT));
        if (canonical == null) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new FieldIssue("genre", "must be one of the supported genres")));
        }
        return canonical;
    }
}
