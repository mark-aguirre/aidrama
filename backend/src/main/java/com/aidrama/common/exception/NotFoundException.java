package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 404: the resource does not exist, or is hidden from the caller to avoid leaking existence. */
public class NotFoundException extends ApiException {

    public NotFoundException(String resource) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", resource + " not found.", List.of());
    }
}
