package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 413: the declared upload exceeds the size limit. */
public class PayloadTooLargeException extends ApiException {

    public PayloadTooLargeException(String code, String message, List<FieldIssue> details) {
        super(HttpStatus.CONTENT_TOO_LARGE, code, message, details);
    }
}
