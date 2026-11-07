package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 401: missing, invalid or expired credentials. */
public class UnauthorizedException extends ApiException {

    public UnauthorizedException(String code, String message) {
        super(HttpStatus.UNAUTHORIZED, code, message, List.of());
    }
}
