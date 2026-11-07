package com.aidrama.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import java.util.List;
import org.hibernate.exception.ConstraintViolationException.ConstraintKind;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.postgresql.util.PSQLException;
import org.postgresql.util.ServerErrorMessage;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * SQLSTATE and constraint name of the trailer-link rules (migration 0011) become the documented HTTP
 * status and error code. No live database: the exceptions are built the way pgjdbc and Hibernate shape
 * them, including the trigger case where Hibernate cannot recover the constraint name from the message.
 */
class TrailerViolationMappingTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    /** An error as the server sends it: severity, SQLSTATE, message and (n) the constraint field. */
    private static PSQLException pgError(String sqlState, String message, String constraint) {
        String wire = "SERROR\0C" + sqlState + "\0M" + message + "\0" + (constraint == null ? "" : "n" + constraint + "\0");
        return new PSQLException(new ServerErrorMessage(wire));
    }

    /** What the JPA path throws: Hibernate failed to read a name from the message, so its constraint is null. */
    private static DataIntegrityViolationException viaHibernateWithoutName(PSQLException pg) {
        return wrap(new org.hibernate.exception.ConstraintViolationException("could not execute statement", pg, "update videos", ConstraintKind.OTHER, null));
    }

    /** What the JPA path throws when the message did contain {@code constraint "name"} and Hibernate parsed it. */
    private static DataIntegrityViolationException viaHibernateWithName(PSQLException pg, String name) {
        return wrap(new org.hibernate.exception.ConstraintViolationException("could not execute statement", pg, "update videos", ConstraintKind.OTHER, name));
    }

    private static DataIntegrityViolationException wrap(Throwable cause) {
        return new DataIntegrityViolationException("could not execute statement", cause);
    }

    static List<Arguments> contract() {
        return List.of(
                Arguments.of("23505", "uq_videos_trailer_video", HttpStatus.CONFLICT, "TRAILER_ALREADY_LINKED"),
                Arguments.of("23514", "ck_videos_trailer_must_be_trailer", HttpStatus.UNPROCESSABLE_ENTITY, "NOT_A_TRAILER"),
                Arguments.of("23514", "ck_videos_trailer_not_self", HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_SELF_LINK"),
                Arguments.of("23514", "ck_videos_trailer_no_nesting", HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_NESTING_NOT_ALLOWED"),
                Arguments.of("23503", "fk_videos_trailer_video", HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_NOT_FOUND"),
                Arguments.of("23503", "fk_videos_trailer_live", HttpStatus.CONFLICT, "TRAILER_DELETED"));
    }

    @ParameterizedTest(name = "{1} -> {2} {3}")
    @MethodSource("contract")
    void triggerRaisedErrorIsMappedFromTheServerConstraintField(String sqlState, String constraint, HttpStatus status, String code) {
        PSQLException pg = pgError(sqlState, "video 1 cannot be linked as a trailer", constraint);

        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(viaHibernateWithoutName(pg));

        assertEnvelope(response, status, code);
    }

    @ParameterizedTest(name = "{1} -> {2} {3}")
    @MethodSource("contract")
    void declarativeConstraintIsMappedFromTheNameHibernateParsed(String sqlState, String constraint, HttpStatus status, String code) {
        PSQLException pg = pgError(sqlState, "violates constraint \"" + constraint + "\"", constraint);

        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(viaHibernateWithName(pg, constraint));

        assertEnvelope(response, status, code);
    }

    @ParameterizedTest(name = "{1} -> {2} {3}")
    @MethodSource("contract")
    void jdbcTemplatePathWithoutHibernateIsMappedToo(String sqlState, String constraint, HttpStatus status, String code) {
        PSQLException pg = pgError(sqlState, "raised by a trigger", constraint);

        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(wrap(pg));

        assertEnvelope(response, status, code);
    }

    @Test
    void alreadyLinkedNamesTheOffendingField() {
        PSQLException pg = pgError("23505", "duplicate key", "uq_videos_trailer_video");

        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(viaHibernateWithoutName(pg));

        assertThat(response.getBody().error().details())
                .containsExactly(new FieldIssue("trailerVideoId", "is already linked to another video"));
    }

    @Test
    void anUnknownTrailerCheckStillAnswers422() {
        PSQLException pg = pgError("23514", "some future rule", "ck_videos_trailer_future_rule");

        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(viaHibernateWithoutName(pg));

        assertEnvelope(response, HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_RULE_VIOLATION");
    }

    @Test
    void otherViolationsKeepTheirExistingMapping() {
        assertEnvelope(handler.handleDataIntegrity(viaHibernateWithoutName(pgError("23514", "x", "ck_videos_title"))),
                HttpStatus.UNPROCESSABLE_ENTITY, "CONSTRAINT_VIOLATION");
        assertEnvelope(handler.handleDataIntegrity(viaHibernateWithoutName(pgError("23503", "x", "fk_videos_series"))),
                HttpStatus.CONFLICT, "REFERENCE_CONFLICT");
        assertEnvelope(handler.handleDataIntegrity(viaHibernateWithoutName(pgError("23505", "x", "uq_videos_slug"))),
                HttpStatus.CONFLICT, "CONFLICT");

        ResponseEntity<ErrorResponse> email = handler.handleDataIntegrity(viaHibernateWithName(pgError("23505", "x", "uq_users_email"), "uq_users_email"));
        assertEnvelope(email, HttpStatus.CONFLICT, "DUPLICATE_RESOURCE");
        assertThat(email.getBody().error().details()).containsExactly(new FieldIssue("email", "is already registered"));
    }

    @Test
    void aNonConstraintDatabaseErrorIsStillAGeneric500() {
        DataIntegrityViolationException ex = wrap(new SQLException("boom with secret internal detail", "XX000"));

        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(ex);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().toString()).doesNotContain("secret internal detail");
    }

    @Test
    void theTrailerConstraintsAreReadFromAPlainPgErrorAsWell() {
        PSQLException pg = pgError("23514", "m", "ck_videos_trailer_not_self");
        assertThat(GlobalExceptionHandler.DbViolation.from(wrap(pg)))
                .isEqualTo(new GlobalExceptionHandler.DbViolation("23514", "ck_videos_trailer_not_self"));
    }

    private static void assertEnvelope(ResponseEntity<ErrorResponse> response, HttpStatus status, String code) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody().error().code()).isEqualTo(code);
        String text = response.getBody().toString().toLowerCase();
        assertThat(text).doesNotContain(
                "sqlstate", "violates check", "violates unique", "violates foreign", "postgres", "constraint \"", "trigger",
                "pk_", "fk_", "ck_", "uq_");
    }
}
