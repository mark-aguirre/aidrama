package com.aidrama.common.exception;

/** One field-level problem in an error response (spec 7.13). */
public record FieldIssue(String field, String issue) {}
