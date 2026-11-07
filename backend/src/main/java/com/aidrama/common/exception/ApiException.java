package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/**
 * A failure that maps to a documented HTTP status and error code. Messages are safe to show to
 * clients: they never carry SQL, paths or stack traces.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;
    private final List<FieldIssue> details;

    public ApiException(HttpStatus status, String code, String message, List<FieldIssue> details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details == null ? List.of() : List.copyOf(details);
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public List<FieldIssue> getDetails() {
        return details;
    }
}
