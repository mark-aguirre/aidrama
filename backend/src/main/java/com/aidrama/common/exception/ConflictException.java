package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 409: the request conflicts with the current state of the resource. */
public class ConflictException extends ApiException {

    public ConflictException(String code, String message) {
        super(HttpStatus.CONFLICT, code, message, List.of());
    }

    public ConflictException(String code, String message, List<FieldIssue> details) {
        super(HttpStatus.CONFLICT, code, message, details);
    }
}
