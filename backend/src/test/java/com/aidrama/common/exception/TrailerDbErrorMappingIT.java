package com.aidrama.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.aidrama.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The trailer-link rules of migration 0011, violated for real in PostgreSQL, travel through the real
 * pgjdbc and Spring translation into {@link GlobalExceptionHandler}. This is the check that the
 * constraint name of a trigger-raised error (RAISE ... USING CONSTRAINT) is really readable.
 *
 * <p>Needs Docker (Testcontainers), so it runs in the verify phase only.
 */
class TrailerDbErrorMappingIT extends IntegrationTestBase {

    private static final String LINK = "update videos set trailer_video_id = ? where id = ?";

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    GlobalExceptionHandler handler;

    private UUID user() {
        UUID id = UUID.randomUUID();
        String name = "trl_" + id.toString().substring(0, 8);
        jdbc.update("insert into users (id, email, username, password_hash) values (?, ?, ?, 'x')", id, name + "@example.test", name);
        return id;
    }

    private UUID video(UUID creator, String type) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into videos (id, creator_id, video_type, title, slug, visibility, publication_status, processing_status, is_ai_generated)
                values (?, ?, ?, 'T', ?, 'PRIVATE', 'DRAFT', 'PENDING', true)
                """, id, creator, type, "t-" + id);
        return id;
    }

    private ResponseEntity<ErrorResponse> rejected(Runnable write) {
        try {
            write.run();
        } catch (DataIntegrityViolationException ex) {
            return handler.handleDataIntegrity(ex);
        }
        throw new AssertionError("Expected the database to reject the write");
    }

    private void assertMapped(ResponseEntity<ErrorResponse> response, HttpStatus status, String code) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody().error().code()).isEqualTo(code);
        assertThat(response.getBody().toString().toLowerCase()).doesNotContain("fk_", "ck_", "uq_", "violates", "postgres");
    }

    @Test
    void linkingAVideoThatIsNotATrailerIs422() {
        UUID creator = user();
        UUID title = video(creator, "MOVIE");
        UUID shortVideo = video(creator, "SHORT");

        assertMapped(rejected(() -> jdbc.update(LINK, shortVideo, title)), HttpStatus.UNPROCESSABLE_ENTITY, "NOT_A_TRAILER");
    }

    @Test
    void aVideoCannotBeItsOwnTrailer() {
        UUID title = video(user(), "MOVIE");

        assertMapped(rejected(() -> jdbc.update(LINK, title, title)), HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_SELF_LINK");
    }

    @Test
    void aTrailerCannotCarryATrailer() {
        UUID creator = user();
        UUID trailer = video(creator, "TRAILER");
        UUID another = video(creator, "TRAILER");

        assertMapped(rejected(() -> jdbc.update(LINK, another, trailer)), HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_NESTING_NOT_ALLOWED");
    }

    @Test
    void aTrailerOfAnotherCreatorIs422NotFound() {
        UUID title = video(user(), "MOVIE");
        UUID foreign = video(user(), "TRAILER");

        assertMapped(rejected(() -> jdbc.update(LINK, foreign, title)), HttpStatus.UNPROCESSABLE_ENTITY, "TRAILER_NOT_FOUND");
    }

    @Test
    void aSoftDeletedTrailerIs409Deleted() {
        UUID creator = user();
        UUID title = video(creator, "MOVIE");
        UUID trailer = video(creator, "TRAILER");
        jdbc.update("update videos set deleted_at = now(), publication_status = 'REMOVED' where id = ?", trailer);

        assertMapped(rejected(() -> jdbc.update(LINK, trailer, title)), HttpStatus.CONFLICT, "TRAILER_DELETED");
    }

    @Test
    void aTrailerBackingTwoTitlesIs409AlreadyLinked() {
        UUID creator = user();
        UUID first = video(creator, "MOVIE");
        UUID second = video(creator, "MOVIE");
        UUID trailer = video(creator, "TRAILER");
        jdbc.update(LINK, trailer, first);

        ResponseEntity<ErrorResponse> response = rejected(() -> jdbc.update(LINK, trailer, second));

        assertMapped(response, HttpStatus.CONFLICT, "TRAILER_ALREADY_LINKED");
        assertThat(response.getBody().error().details()).containsExactly(new FieldIssue("trailerVideoId", "is already linked to another video"));
    }
}
