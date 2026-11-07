package com.aidrama.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.aidrama.support.IntegrationTestBase;
import com.aidrama.user.User;
import com.aidrama.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Real PostgreSQL violations travel through the real exception translation and into the handler:
 * SQLSTATE 23505 maps to 409, 23503 to 409, 23514 to 422. No SQL or constraint text reaches the client.
 */
class DbErrorMappingIT extends IntegrationTestBase {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    UserRepository users;

    @Autowired
    GlobalExceptionHandler handler;

    private UUID user() {
        UUID id = UUID.randomUUID();
        String name = "dbe_" + id.toString().substring(0, 8);
        jdbc.update("insert into users (id, email, username, password_hash) values (?, ?, ?, 'x')", id, name + "@example.test", name);
        return id;
    }

    private DataIntegrityViolationException violation(Runnable action) {
        return (DataIntegrityViolationException) catchThrowableOfType(action);
    }

    private Throwable catchThrowableOfType(Runnable action) {
        try {
            action.run();
        } catch (Throwable t) {
            return t;
        }
        throw new AssertionError("Expected a database violation");
    }

    private void assertBody(ResponseEntity<ErrorResponse> response, HttpStatus status, String code) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody().error().code()).isEqualTo(code);
        String text = response.getBody().toString().toLowerCase();
        assertThat(text).doesNotContain("sqlstate", "violates check", "violates unique", "violates foreign", "constraint \"", "postgres", "pk_", "fk_", "ck_", "uq_");
    }

    @Test
    void uniqueViolationFromJpaMapsTo409WithTheOffendingField() {
        UUID id = user();
        String username = jdbc.queryForObject("select username from users where id = ?", String.class, id);

        DataIntegrityViolationException ex = violation(() ->
                users.saveAndFlush(User.register("other_" + id + "@example.test", username, "x")));
        ResponseEntity<ErrorResponse> response = handler.handleDataIntegrity(ex);

        assertBody(response, HttpStatus.CONFLICT, "DUPLICATE_RESOURCE");
        assertThat(response.getBody().error().details()).containsExactly(new FieldIssue("username", "is already taken"));
    }

    @Test
    void uniqueViolationWithoutKnownConstraintMapsToGeneric409() {
        UUID id = user();
        jdbc.update("insert into user_roles (id, user_id, role) values (gen_random_uuid(), ?, 'USER')", id);
        DataIntegrityViolationException dup = violation(() ->
                jdbc.update("insert into user_roles (id, user_id, role) values (gen_random_uuid(), ?, 'USER')", id));
        assertBody(handler.handleDataIntegrity(dup), HttpStatus.CONFLICT, "CONFLICT");
    }

    @Test
    void foreignKeyViolationMapsTo409() {
        DataIntegrityViolationException ex = violation(() -> jdbc.update(
                "insert into user_profiles (user_id, display_name) values (?, 'Ghost')", UUID.randomUUID()));
        assertBody(handler.handleDataIntegrity(ex), HttpStatus.CONFLICT, "REFERENCE_CONFLICT");
    }

    @Test
    void checkViolationMapsTo422() {
        UUID creator = user();
        // READY or PUBLISHED requires processing_status READY (ck_videos_ready_requires_processed).
        DataIntegrityViolationException ex = violation(() -> jdbc.update("""
                insert into videos (id, creator_id, video_type, title, slug, visibility, publication_status,
                                    processing_status, is_ai_generated, genre, published_at)
                values (gen_random_uuid(), ?, 'MOVIE', 'T', ?, 'PUBLIC', 'PUBLISHED', 'PENDING', true, 'Drama', now())
                """, creator, "check-" + UUID.randomUUID()));
        assertBody(handler.handleDataIntegrity(ex), HttpStatus.UNPROCESSABLE_ENTITY, "CONSTRAINT_VIOLATION");
    }

    @Test
    void softDeleteGuardViolationMapsTo409() {
        UUID creator = user();
        UUID series = UUID.randomUUID();
        jdbc.update("insert into drama_series (id, creator_id, title, slug) values (?, ?, 'S', ?)", series, creator, "guard-" + series);
        UUID season = UUID.randomUUID();
        jdbc.update("insert into drama_seasons (id, series_id, season_number) values (?, ?, 1)", season, series);

        // Soft-deleting a series that still has a live season is refused by the 0009 guard trigger.
        DataIntegrityViolationException ex = violation(() -> jdbc.update("update drama_series set deleted_at = now() where id = ?", series));
        assertBody(handler.handleDataIntegrity(ex), HttpStatus.CONFLICT, "REFERENCE_CONFLICT");
    }

    @Test
    void unrelatedErrorsBecomeAGeneric500WithoutDetails() {
        ResponseEntity<ErrorResponse> response = handler.handleUnexpected(new IllegalStateException("secret internal detail"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().error().message()).isEqualTo("An unexpected error occurred.");
        assertThat(response.getBody().toString()).doesNotContain("secret internal detail");
    }
}
