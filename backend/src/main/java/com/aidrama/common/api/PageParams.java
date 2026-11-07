package com.aidrama.common.api;

import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.FieldIssue;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

/** Validated page request. {@code page} is 1-based; {@code pageSize} is capped. */
public record PageParams(int page, int pageSize) {

    public static final int DEFAULT_PAGE_SIZE = 20;
    public static final int MAX_PAGE_SIZE = 50;

    public static PageParams of(Integer page, Integer pageSize) {
        int p = page == null ? 1 : page;
        int s = pageSize == null ? DEFAULT_PAGE_SIZE : pageSize;
        if (p < 1) {
            throw new BadRequestException(
                    "VALIDATION_ERROR", "Invalid pagination.", List.of(new FieldIssue("page", "must be 1 or greater")));
        }
        if (s < 1 || s > MAX_PAGE_SIZE) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Invalid pagination.",
                    List.of(new FieldIssue("pageSize", "must be between 1 and " + MAX_PAGE_SIZE)));
        }
        return new PageParams(p, s);
    }

    public PageRequest toPageRequest(Sort sort) {
        return PageRequest.of(page - 1, pageSize, sort);
    }
}
