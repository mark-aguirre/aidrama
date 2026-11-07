package com.aidrama.discovery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.support.IntegrationTestBase;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/** TEMPORARY verification of GET /search. Delete after running. */
class SearchTempIT extends IntegrationTestBase {

    @Autowired
    JdbcTemplate jdbc;

    private UUID creator(String displayName) {
        UUID id = UUID.randomUUID();
        String username = "u_" + id.toString().substring(0, 8);
        jdbc.update("insert into users (id, email, username, password_hash) values (?, ?, ?, 'x')", id, username + "@example.test", username);
        jdbc.update("insert into user_profiles (user_id, display_name) values (?, ?)", id, displayName);
        return id;
    }

    private void video(UUID creator, String slug, String title, String description, String genre,
                       String visibility, String publication) {
        UUID id = UUID.randomUUID();
        boolean processed = publication.equals("READY") || publication.equals("PUBLISHED");
        jdbc.update("""
                insert into videos (id, creator_id, video_type, title, slug, description, genre, language,
                                    visibility, publication_status, processing_status, is_ai_generated, view_count,
                                    published_at)
                values (?, ?, 'MOVIE', ?, ?, ?, ?, 'en', ?, ?, ?, true, 0,
                        case when ? = 'PUBLISHED' then now() else null end)
                """, id, creator, title, slug, description, genre, visibility, publication,
                processed ? "READY" : "PENDING", publication);
    }

    private List<String> search(String q) throws Exception {
        MvcResult r = mvc.perform(get("/api/v1/search").param("q", q).param("pageSize", "50"))
                .andExpect(status().isOk()).andReturn();
        return JsonPath.read(r.getResponse().getContentAsString(), "$.data[*].slug");
    }

    @Test
    void matchesTitleDescriptionGenreAndCreatorNameAmongDiscoverableOnly() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        UUID alice = creator("Alice " + tag);
        UUID bob = creator("Bob Smith");

        video(alice, "t-" + tag, "The " + tag + " Heist", "a plain story", "Drama", "PUBLIC", "PUBLISHED");
        video(bob, "d-" + tag, "Unrelated", "deep " + tag + " mystery here", "Drama", "PUBLIC", "PUBLISHED");
        video(bob, "g-" + tag, "Another", "nothing", tag + "-Genre", "PUBLIC", "PUBLISHED");
        video(alice, "c-" + tag, "By Alice", "no term in text", "Drama", "PUBLIC", "PUBLISHED");

        // Hidden ones that contain the term but must never appear.
        video(bob, "priv-" + tag, "Private " + tag, "x", "Drama", "PRIVATE", "PUBLISHED");
        video(bob, "draft-" + tag, "Draft " + tag, "x", "Drama", "PUBLIC", "DRAFT");

        // title, description, and genre matches for the tag term
        assertThat(search(tag)).containsExactlyInAnyOrder("t-" + tag, "d-" + tag, "g-" + tag);

        // creator display-name match (case-insensitive): both of Alice's public videos
        assertThat(search("alice " + tag)).containsExactlyInAnyOrder("t-" + tag, "c-" + tag);

        // nothing matches
        assertThat(search("zzz-no-match-" + tag)).isEmpty();
    }

    @Test
    void blankQueryReturnsEmptyAndOverlongQueryIs400() throws Exception {
        mvc.perform(get("/api/v1/search").param("q", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0))
                .andExpect(jsonPath("$.pagination.totalItems").value(0));

        mvc.perform(get("/api/v1/search"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(0));

        String tooLong = "x".repeat(201);
        mvc.perform(get("/api/v1/search").param("q", tooLong))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
    }

    @Test
    void wildcardsInTermMatchLiterally() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        UUID c = creator("Creator " + tag);
        video(c, "pct-" + tag, "Save 50% " + tag, "x", "Drama", "PUBLIC", "PUBLISHED");
        video(c, "plain-" + tag, "Plain " + tag, "x", "Drama", "PUBLIC", "PUBLISHED");

        // "50%" must match only the literal percent title, not everything.
        assertThat(search("50%")).containsExactly("pct-" + tag);
    }
}
