package com.aidrama.like;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.support.IntegrationTestBase;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Like and unlike against real PostgreSQL: the {@code ON CONFLICT} insert, the delete, the atomic counter, the
 * {@code isLiked} batch lookup and the 401/404 behavior. Needs Docker (Testcontainers), so it runs in the
 * {@code verify} phase with the other *IT classes and is skipped where Docker is not available.
 */
class LikeToggleIT extends IntegrationTestBase {

    @Autowired
    JdbcTemplate jdbc;

    private String video(String visibility, String publication) {
        UUID creator = UUID.randomUUID();
        String username = "c_" + creator.toString().substring(0, 8);
        jdbc.update("insert into users (id, email, username, password_hash) values (?, ?, ?, 'x')", creator, username + "@example.test", username);
        jdbc.update("insert into user_profiles (user_id, display_name) values (?, ?)", creator, "Creator");
        String slug = "likes-" + UUID.randomUUID().toString().substring(0, 8);
        boolean published = publication.equals("PUBLISHED");
        jdbc.update("""
                insert into videos (id, creator_id, video_type, title, slug, genre, visibility, publication_status,
                                    processing_status, is_ai_generated, published_at)
                values (?, ?, 'MOVIE', 'Likes test', ?, 'Drama', ?, ?, ?, true, case when ? then now() else null end)
                """, UUID.randomUUID(), creator, slug, visibility, publication, published ? "READY" : "PENDING", published);
        return slug;
    }

    private long likeCount(String slug) {
        return jdbc.queryForObject("select like_count from videos where slug = ?", Long.class, slug);
    }

    private long likeRows(String slug) {
        return jdbc.queryForObject(
                "select count(*) from video_likes l join videos v on v.id = l.video_id where v.slug = ?", Long.class, slug);
    }

    private static String url(String slug) {
        return "/api/v1/videos/" + slug + "/like";
    }

    @Test
    void likeInsertsOneRowForTheTokenUserAndCountsOnce() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");
        TestUser user = registerUser();

        mvc.perform(post(url(slug)).header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.likeCount").value(1));

        assertThat(likeCount(slug)).isEqualTo(1);
        UUID stored = jdbc.queryForObject(
                "select l.user_id from video_likes l join videos v on v.id = l.video_id where v.slug = ?", UUID.class, slug);
        assertThat(stored).isEqualTo(user.id());
    }

    @Test
    void likingTwiceIsIdempotent() throws Exception {
        String slug = video("UNLISTED", "PUBLISHED");
        TestUser user = registerUser();

        mvc.perform(post(url(slug)).header("Authorization", bearer(user))).andExpect(status().isOk());
        mvc.perform(post(url(slug)).header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.likeCount").value(1));

        assertThat(likeRows(slug)).isEqualTo(1);
        assertThat(likeCount(slug)).isEqualTo(1);
    }

    @Test
    void unlikeDeletesTheRowAndDecrements_andUnlikingAgainIsANoOp() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");
        TestUser user = registerUser();
        mvc.perform(post(url(slug)).header("Authorization", bearer(user))).andExpect(status().isOk());

        mvc.perform(delete(url(slug)).header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.likeCount").value(0));
        mvc.perform(delete(url(slug)).header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.likeCount").value(0));

        assertThat(likeRows(slug)).isZero();
        assertThat(likeCount(slug)).isZero();
    }

    @Test
    void unlikeNeverTouchesOtherUsersLikes() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");
        TestUser a = registerUser();
        TestUser b = registerUser();
        mvc.perform(post(url(slug)).header("Authorization", bearer(a))).andExpect(status().isOk());

        mvc.perform(delete(url(slug)).header("Authorization", bearer(b)))
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.likeCount").value(1));

        assertThat(likeRows(slug)).isEqualTo(1);
    }

    @Test
    void parallelLikesFromDifferentUsersAllCount() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");
        int users = 8;
        List<TestUser> testUsers = new ArrayList<>();
        for (int i = 0; i < users; i++) {
            testUsers.add(registerUser());
        }
        ExecutorService pool = Executors.newFixedThreadPool(users);
        try {
            List<Callable<Integer>> calls = testUsers.stream()
                    .<Callable<Integer>>map(u -> () -> mvc.perform(post(url(slug)).header("Authorization", bearer(u)))
                            .andReturn()
                            .getResponse()
                            .getStatus())
                    .toList();
            for (Future<Integer> f : pool.invokeAll(calls)) {
                assertThat(f.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(likeRows(slug)).isEqualTo(users);
        assertThat(likeCount(slug)).isEqualTo(users);
    }

    @Test
    void parallelDuplicateLikesFromOneUserCountOnce() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");
        TestUser user = registerUser();
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            List<Callable<Integer>> calls = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                calls.add(() -> mvc.perform(post(url(slug)).header("Authorization", bearer(user)))
                        .andReturn()
                        .getResponse()
                        .getStatus());
            }
            for (Future<Integer> f : pool.invokeAll(calls)) {
                assertThat(f.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(likeRows(slug)).isEqualTo(1);
        assertThat(likeCount(slug)).isEqualTo(1);
    }

    @Test
    void anonymousAndInvalidTokenAre401AndWriteNothing() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");

        mvc.perform(post(url(slug))).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(delete(url(slug))).andExpect(status().isUnauthorized());
        mvc.perform(post(url(slug)).header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());

        assertThat(likeRows(slug)).isZero();
        assertThat(likeCount(slug)).isZero();
    }

    @Test
    void draftPrivateDeletedAndUnknownVideosAre404AndNothingIsWritten() throws Exception {
        String draft = video("PUBLIC", "DRAFT");
        String priv = video("PRIVATE", "PUBLISHED");
        String deleted = video("PUBLIC", "PUBLISHED");
        jdbc.update("update videos set deleted_at = now(), publication_status = 'REMOVED' where slug = ?", deleted);
        TestUser user = registerUser();

        for (String slug : new String[] {draft, priv, deleted, "no-such-video"}) {
            mvc.perform(post(url(slug)).header("Authorization", bearer(user)))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
            mvc.perform(delete(url(slug)).header("Authorization", bearer(user))).andExpect(status().isNotFound());
        }
        assertThat(likeRows(draft) + likeRows(priv) + likeRows(deleted)).isZero();
    }

    @Test
    void isLikedOnTheSingleVideoFollowsTheViewer() throws Exception {
        String slug = video("PUBLIC", "PUBLISHED");
        TestUser liker = registerUser();
        TestUser other = registerUser();
        mvc.perform(post(url(slug)).header("Authorization", bearer(liker))).andExpect(status().isOk());

        mvc.perform(get("/api/v1/videos/" + slug).header("Authorization", bearer(liker)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isLiked").value(true))
                .andExpect(jsonPath("$.likeCount").value(1));
        mvc.perform(get("/api/v1/videos/" + slug).header("Authorization", bearer(other)))
                .andExpect(jsonPath("$.isLiked").value(false));
        mvc.perform(get("/api/v1/videos/" + slug))
                .andExpect(jsonPath("$.isLiked").value(false))
                .andExpect(jsonPath("$.likeCount").value(1));

        mvc.perform(delete(url(slug)).header("Authorization", bearer(liker))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/videos/" + slug).header("Authorization", bearer(liker)))
                .andExpect(jsonPath("$.isLiked").value(false));
    }

    @Test
    @SuppressWarnings("unchecked")
    void isLikedInTheVideoListFollowsTheViewer() throws Exception {
        String liked = video("PUBLIC", "PUBLISHED");
        String notLiked = video("PUBLIC", "PUBLISHED");
        TestUser user = registerUser();
        mvc.perform(post(url(liked)).header("Authorization", bearer(user))).andExpect(status().isOk());

        String body = mvc.perform(get("/api/v1/videos").param("sort", "recent").param("pageSize", "50").header("Authorization", bearer(user)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat((List<Boolean>) com.jayway.jsonpath.JsonPath.read(body, "$.data[?(@.slug=='" + liked + "')].isLiked"))
                .containsExactly(true);
        assertThat((List<Boolean>) com.jayway.jsonpath.JsonPath.read(body, "$.data[?(@.slug=='" + notLiked + "')].isLiked"))
                .containsExactly(false);
    }
}
