package com.aidrama.common.exception;

import java.util.List;
import org.springframework.http.HttpStatus;

/** 422: the request is well formed but violates a business rule (for example publishing a video that is still processing). */
public class BusinessRuleException extends ApiException {

    public BusinessRuleException(String code, String message) {
        super(HttpStatus.UNPROCESSABLE_ENTITY, code, message, List.of());
    }

    public BusinessRuleException(String code, String message, List<FieldIssue> details) {
        super(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
    }
}
