package com.aidrama.common.exception;

import com.aidrama.common.web.RequestIdFilter;
import jakarta.validation.ConstraintViolationException;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.hibernate.exception.ConstraintViolationException.ConstraintKind;
import org.postgresql.util.PSQLException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns every failure into the documented error envelope (spec 7.13). Clients never see stack
 * traces, SQL or constraint internals. Unexpected errors are logged with the request id only.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** Known unique constraints mapped to a field-level message (SQLSTATE 23505). */
    private static final Map<String, FieldIssue> UNIQUE_FIELD_ISSUES = Map.of(
            "uq_users_email", new FieldIssue("email", "is already registered"),
            "uq_users_username", new FieldIssue("username", "is already taken"));

    /** A database rule translated into a client-facing status, code and message. No constraint or SQL text. */
    record MappedViolation(HttpStatus status, String code, String message, FieldIssue field) {}

    private static final FieldIssue TRAILER_FIELD_ALREADY_LINKED =
            new FieldIssue("trailerVideoId", "is already linked to another video");

    /**
     * Trailer-link rules of migration 0011, keyed by constraint name. Trigger-raised errors carry the
     * constraint name through {@code RAISE ... USING CONSTRAINT}, read from the PostgreSQL error fields.
     * Codes match the ones the service layer throws before the database is reached.
     */
    private static final Map<String, MappedViolation> TRAILER_VIOLATIONS = Map.of(
            "uq_videos_trailer_video", new MappedViolation(HttpStatus.CONFLICT, "TRAILER_ALREADY_LINKED",
                    "This trailer is already linked to another video.", TRAILER_FIELD_ALREADY_LINKED),
            "ck_videos_trailer_must_be_trailer", new MappedViolation(HttpStatus.UNPROCESSABLE_ENTITY, "NOT_A_TRAILER",
                    "Only a video of type TRAILER can be linked as a trailer.",
                    new FieldIssue("trailerVideoId", "must be a TRAILER video")),
            "ck_videos_trailer_not_self", new MappedViolation(HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_SELF_LINK",
                    "A video cannot be its own trailer.", new FieldIssue("trailerVideoId", "must be a different video")),
            "ck_videos_trailer_no_nesting", new MappedViolation(HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_NESTING_NOT_ALLOWED",
                    "A trailer cannot have a trailer of its own.", null),
            "fk_videos_trailer_video", new MappedViolation(HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_NOT_FOUND",
                    "The trailer video was not found.", new FieldIssue("trailerVideoId", "was not found")),
            "fk_videos_trailer_live", new MappedViolation(HttpStatus.CONFLICT, "TRAILER_DELETED",
                    "The trailer video was deleted.", new FieldIssue("trailerVideoId", "was deleted")));

    private static final String TRAILER_CHECK_PREFIX = "ck_videos_trailer_";

    /** The mapping for a trailer-link violation, or null when the violation is something else. */
    static MappedViolation trailerViolation(DbViolation violation) {
        String constraint = violation.constraint();
        if (constraint == null) {
            return null;
        }
        MappedViolation known = TRAILER_VIOLATIONS.get(constraint);
        if (known != null) {
            return known;
        }
        // A trailer CHECK added later still answers 422 instead of the generic 500 path.
        return constraint.startsWith(TRAILER_CHECK_PREFIX) && "23514".equals(violation.sqlState())
                ? new MappedViolation(HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_RULE_VIOLATION",
                        "The trailer link violates a data integrity rule.", null)
                : null;
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErrorResponse> handleApi(ApiException ex) {
        return build(ex.getStatus(), ex.getCode(), ex.getMessage(), ex.getDetails());
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ResponseEntity<ErrorResponse> handleOptimisticLock(OptimisticLockingFailureException ex) {
        return build(
                HttpStatus.CONFLICT,
                "CONCURRENT_MODIFICATION",
                "The resource was changed by someone else. Reload it and try again.",
                List.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ErrorResponse> handleDataIntegrity(DataIntegrityViolationException ex) {
        DbViolation violation = DbViolation.from(ex);
        log.warn("Database constraint rejected a write: sqlState={} constraint={}", violation.sqlState(), violation.constraint());
        MappedViolation trailer = trailerViolation(violation);
        if (trailer != null) {
            return build(trailer.status(), trailer.code(), trailer.message(),
                    trailer.field() == null ? List.of() : List.of(trailer.field()));
        }
        return switch (violation.sqlState() == null ? "" : violation.sqlState()) {
            case "23505" -> {
                FieldIssue issue = violation.constraint() == null ? null : UNIQUE_FIELD_ISSUES.get(violation.constraint());
                yield build(
                        HttpStatus.CONFLICT,
                        issue != null ? "DUPLICATE_RESOURCE" : "CONFLICT",
                        issue != null
                                ? "A record with this " + issue.field() + " already exists."
                                : "The request conflicts with an existing resource.",
                        issue != null ? List.of(issue) : List.of());
            }
            case "23503" -> build(
                    HttpStatus.CONFLICT,
                    "REFERENCE_CONFLICT",
                    "The request conflicts with related records.",
                    List.of());
            case "23514" -> build(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "CONSTRAINT_VIOLATION",
                    "The request violates a data integrity rule.",
                    List.of());
            default -> internal(ex);
        };
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ErrorResponse> handleBeanValidation(ConstraintViolationException ex) {
        List<FieldIssue> issues = ex.getConstraintViolations().stream()
                .map(v -> new FieldIssue(lastNode(v.getPropertyPath().toString()), v.getMessage()))
                .toList();
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed.", issues);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<ErrorResponse> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                List.of(new FieldIssue(ex.getName(), "has an invalid value")));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex) {
        return build(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to perform this action.", List.of());
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        return internal(ex);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldIssue> issues = new ArrayList<>();
        for (ObjectError error : ex.getBindingResult().getAllErrors()) {
            String field = error instanceof FieldError fe ? fe.getField() : error.getObjectName();
            issues.add(new FieldIssue(field, error.getDefaultMessage()));
        }
        return wrap(build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed.", issues));
    }

    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldIssue> issues = new ArrayList<>();
        ex.getParameterValidationResults().forEach(result -> {
            String name = result.getMethodParameter().getParameterName();
            result.getResolvableErrors().forEach(e -> issues.add(new FieldIssue(name, e.getDefaultMessage())));
        });
        return wrap(build(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request validation failed.", issues));
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return wrap(build(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "The request body is missing or malformed.", List.of()));
    }

    @Override
    protected ResponseEntity<Object> handleMissingServletRequestParameter(
            MissingServletRequestParameterException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return wrap(build(
                HttpStatus.BAD_REQUEST,
                "VALIDATION_ERROR",
                "Request validation failed.",
                List.of(new FieldIssue(ex.getParameterName(), "is required"))));
    }

    /** Fallback for all remaining Spring MVC exceptions (404, 405, 415, ...). */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        HttpStatus status = HttpStatus.resolve(statusCode.value());
        String code = switch (statusCode.value()) {
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 406 -> "NOT_ACCEPTABLE";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> statusCode.is5xxServerError() ? "INTERNAL_ERROR" : "BAD_REQUEST";
        };
        String message = statusCode.is5xxServerError()
                ? "An unexpected error occurred."
                : (status != null ? status.getReasonPhrase() : "Request failed") + ".";
        if (statusCode.is5xxServerError()) {
            log.error("Unhandled MVC failure: {}", ex.getClass().getSimpleName(), ex);
        }
        return wrap(new ResponseEntity<>(
                ErrorResponse.of(code, message, RequestIdFilter.current(), List.of()), headers, statusCode));
    }

    private ResponseEntity<ErrorResponse> internal(Exception ex) {
        log.error("Unhandled exception", ex);
        return build(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "An unexpected error occurred.", List.of());
    }

    private static ResponseEntity<ErrorResponse> build(
            HttpStatus status, String code, String message, List<FieldIssue> details) {
        return ResponseEntity.status(status)
                .body(ErrorResponse.of(code, message, RequestIdFilter.current(), details));
    }

    @SuppressWarnings("unchecked")
    private static ResponseEntity<Object> wrap(ResponseEntity<?> entity) {
        return (ResponseEntity<Object>) entity;
    }

    private static String lastNode(String path) {
        int dot = path.lastIndexOf('.');
        return dot < 0 ? path : path.substring(dot + 1);
    }

    /** SQLSTATE and constraint name found in the cause chain of a persistence exception. */
    record DbViolation(String sqlState, String constraint) {

        static DbViolation from(Throwable ex) {
            String state = null;
            String constraint = null;
            boolean fromHibernate = false;
            for (Throwable t = ex; t != null; t = t.getCause()) {
                if (t instanceof org.hibernate.exception.ConstraintViolationException hce) {
                    state = hce.getSQLState();
                    constraint = hce.getConstraintName();
                    if (hce.getKind() == ConstraintKind.UNIQUE && state == null) {
                        state = "23505";
                    }
                    fromHibernate = true;
                } else if (t instanceof SQLException sql) {
                    if (!fromHibernate && sql.getSQLState() != null) {
                        state = sql.getSQLState();
                    }
                    // Hibernate reads the name from the message text, which trigger errors do not contain.
                    if (constraint == null) {
                        constraint = serverConstraint(sql);
                    }
                }
                if (t.getCause() == t) {
                    break;
                }
            }
            return new DbViolation(state, constraint);
        }

        /** The constraint field of a PostgreSQL error, set by constraints and by {@code RAISE ... USING CONSTRAINT}. */
        private static String serverConstraint(SQLException sql) {
            if (sql instanceof PSQLException pg && pg.getServerErrorMessage() != null) {
                return pg.getServerErrorMessage().getConstraint();
            }
            return null;
        }
    }
}
