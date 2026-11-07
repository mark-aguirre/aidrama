package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 502: a downstream system (object storage) failed or timed out. */
public class DependencyUnavailableException extends ApiException {

    public DependencyUnavailableException(String code, String message) {
        super(HttpStatus.BAD_GATEWAY, code, message, List.of());
    }
}
