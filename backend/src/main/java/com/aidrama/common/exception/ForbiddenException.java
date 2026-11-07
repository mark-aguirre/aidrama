package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 403: authenticated, but not allowed to perform the action. */
public class ForbiddenException extends ApiException {

    public ForbiddenException(String code, String message) {
        super(HttpStatus.FORBIDDEN, code, message, List.of());
    }
}
