package com.aidrama.view;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.support.IntegrationTestBase;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * View counting against real PostgreSQL: the ON CONFLICT clause with the partial-index predicate, the atomic
 * counter bump and the stored (hashed) viewer key. Needs Docker (Testcontainers).
 */
class ViewCountingIT extends IntegrationTestBase {

    @Autowired
    JdbcTemplate jdbc;

    private String publishedVideo(String visibility, String publication) {
        UUID creator = UUID.randomUUID();
        String username = "c_" + creator.toString().substring(0, 8);
        jdbc.update("insert into users (id, email, username, password_hash) values (?, ?, ?, 'x')", creator, username + "@example.test", username);
        jdbc.update("insert into user_profiles (user_id, display_name) values (?, ?)", creator, "Creator");
        String slug = "views-" + UUID.randomUUID().toString().substring(0, 8);
        boolean published = publication.equals("PUBLISHED");
        jdbc.update("""
                insert into videos (id, creator_id, video_type, title, slug, genre, visibility, publication_status,
                                    processing_status, is_ai_generated, published_at)
                values (?, ?, 'MOVIE', 'Views test', ?, 'Drama', ?, ?, ?, true, case when ? then now() else null end)
                """, UUID.randomUUID(), creator, slug, visibility, publication, published ? "READY" : "PENDING", published);
        return slug;
    }

    private long viewCount(String slug) {
        return jdbc.queryForObject("select view_count from videos where slug = ?", Long.class, slug);
    }

    private long events(String slug) {
        return jdbc.queryForObject(
                "select count(*) from video_view_events e join videos v on v.id = e.video_id where v.slug = ?", Long.class, slug);
    }

    private static MockHttpServletRequestBuilder view(String slug, String type, int watched, String session) {
        String body = "{\"eventType\":\"%s\",\"watchedSeconds\":%d%s}"
                .formatted(type, watched, session == null ? "" : ",\"sessionId\":\"" + session + "\"");
        return post("/api/v1/videos/" + slug + "/view-events").contentType(MediaType.APPLICATION_JSON).content(body);
    }

    @Test
    void anonymousQualifiedViewIsStoredHashedAndCountedOnce() throws Exception {
        String slug = publishedVideo("PUBLIC", "PUBLISHED");
        String session = UUID.randomUUID().toString();

        mvc.perform(view(slug, "VIEW_QUALIFIED", 12, session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recorded").value(true))
                .andExpect(jsonPath("$.counted").value(true));

        assertThat(viewCount(slug)).isEqualTo(1);
        var row = jdbc.queryForMap(
                "select e.viewer_user_id, e.viewer_key, e.dedupe_key, e.watched_seconds from video_view_events e join videos v on v.id = e.video_id where v.slug = ?",
                slug);
        assertThat(row.get("viewer_user_id")).isNull();
        assertThat((String) row.get("viewer_key")).matches("[0-9a-f]{64}").isNotEqualTo(session);
        assertThat((String) row.get("dedupe_key")).hasSize(64);
        assertThat(row.get("watched_seconds")).isEqualTo(12);
    }

    @Test
    void repeatedQualifiedViewSameDayInsertsNothingAndDoesNotCountAgain() throws Exception {
        String slug = publishedVideo("PUBLIC", "PUBLISHED");
        String session = UUID.randomUUID().toString();

        mvc.perform(view(slug, "VIEW_QUALIFIED", 12, session)).andExpect(status().isOk());
        mvc.perform(view(slug, "VIEW_QUALIFIED", 40, session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recorded").value(false))
                .andExpect(jsonPath("$.counted").value(false));

        assertThat(viewCount(slug)).isEqualTo(1);
        assertThat(events(slug)).isEqualTo(1);
    }

    @Test
    void anotherSessionCountsSeparately() throws Exception {
        String slug = publishedVideo("PUBLIC", "PUBLISHED");

        mvc.perform(view(slug, "VIEW_QUALIFIED", 12, UUID.randomUUID().toString())).andExpect(status().isOk());
        mvc.perform(view(slug, "VIEW_QUALIFIED", 12, UUID.randomUUID().toString())).andExpect(status().isOk());

        assertThat(viewCount(slug)).isEqualTo(2);
    }

    @Test
    void playStartIsStoredWithoutCountingAndDoesNotBlockTheQualifiedView() throws Exception {
        String slug = publishedVideo("UNLISTED", "PUBLISHED");
        String session = UUID.randomUUID().toString();

        mvc.perform(view(slug, "PLAY_START", 0, session))
                .andExpect(jsonPath("$.recorded").value(true))
                .andExpect(jsonPath("$.counted").value(false));
        assertThat(viewCount(slug)).isZero();

        mvc.perform(view(slug, "VIEW_QUALIFIED", 10, session)).andExpect(jsonPath("$.counted").value(true));
        assertThat(viewCount(slug)).isEqualTo(1);
        assertThat(events(slug)).isEqualTo(2);
    }

    @Test
    void belowThresholdWritesNothing() throws Exception {
        String slug = publishedVideo("PUBLIC", "PUBLISHED");

        mvc.perform(view(slug, "VIEW_QUALIFIED", 9, UUID.randomUUID().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recorded").value(false))
                .andExpect(jsonPath("$.counted").value(false));

        assertThat(viewCount(slug)).isZero();
        assertThat(events(slug)).isZero();
    }

    @Test
    void signedInViewerIsStoredWithTheirUserIdFromTheToken() throws Exception {
        String slug = publishedVideo("PUBLIC", "PUBLISHED");
        TestUser user = registerUser();

        mvc.perform(view(slug, "VIEW_QUALIFIED", 15, null).header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counted").value(true));

        UUID stored = jdbc.queryForObject(
                "select e.viewer_user_id from video_view_events e join videos v on v.id = e.video_id where v.slug = ?", UUID.class, slug);
        assertThat(stored).isEqualTo(user.id());
    }

    @Test
    void draftPrivateAndUnknownVideosAre404AndNothingIsWritten() throws Exception {
        String draft = publishedVideo("PUBLIC", "DRAFT");
        String priv = publishedVideo("PRIVATE", "PUBLISHED");

        for (String slug : new String[] {draft, priv, "no-such-video"}) {
            mvc.perform(view(slug, "VIEW_QUALIFIED", 30, UUID.randomUUID().toString()))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        }
        assertThat(events(draft) + events(priv)).isZero();
    }

    @Test
    void anonymousCallerWithoutASessionIdIsA400() throws Exception {
        String slug = publishedVideo("PUBLIC", "PUBLISHED");

        mvc.perform(view(slug, "VIEW_QUALIFIED", 30, null))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.details[0].field").value("sessionId"));
    }
}
