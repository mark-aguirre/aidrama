package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 400: the request is malformed or fails validation. */
public class BadRequestException extends ApiException {

    public BadRequestException(String code, String message) {
        super(HttpStatus.BAD_REQUEST, code, message, List.of());
    }

    public BadRequestException(String code, String message, List<FieldIssue> details) {
        super(HttpStatus.BAD_REQUEST, code, message, details);
    }
}
