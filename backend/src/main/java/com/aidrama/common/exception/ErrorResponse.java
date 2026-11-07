package com.aidrama.common.exception;

import java.util.List;

/** Error envelope returned for every non-2xx response (spec 7.13). */
public record ErrorResponse(Body error) {

    /** Error body. {@code details} is always present and empty when there are no field issues. */
    public record Body(String code, String message, String requestId, List<FieldIssue> details) {}

    public static ErrorResponse of(String code, String message, String requestId, List<FieldIssue> details) {
        return new ErrorResponse(new Body(code, message, requestId, details == null ? List.of() : details));
    }
}
