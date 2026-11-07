package com.aidrama.common.api;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/** Standard paginated envelope (spec 7.12). Mirrors {@code Paginated<T>} in the frontend domain types. */
public record Paginated<T>(List<T> data, Pagination pagination) {

    /** Page metadata. {@code page} is 1-based. */
    public record Pagination(int page, int pageSize, long totalItems, int totalPages, boolean hasNext) {}

    public static <S, T> Paginated<T> of(Page<S> page, Function<List<S>, List<T>> mapper) {
        int totalPages = Math.max(1, page.getTotalPages());
        return new Paginated<>(
                mapper.apply(page.getContent()),
                new Pagination(
                        page.getNumber() + 1,
                        page.getSize(),
                        page.getTotalElements(),
                        totalPages,
                        page.getNumber() + 1 < totalPages));
    }
}
