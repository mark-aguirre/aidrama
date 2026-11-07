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

/**
 * The published + public + not-deleted rule and the parent-series access rule (SCHEMA.md backend rule 1),
 * checked with rows seeded straight into PostgreSQL. Each test uses its own random genre so lists are isolated.
 */
class DiscoveryVisibilityIT extends IntegrationTestBase {

    @Autowired
    JdbcTemplate jdbc;

    // ---- seeding ----

    private UUID creator(String name) {
        UUID id = UUID.randomUUID();
        String username = name + "_" + id.toString().substring(0, 8);
        jdbc.update("insert into users (id, email, username, password_hash) values (?, ?, ?, 'x')", id, username + "@example.test", username);
        jdbc.update("insert into user_profiles (user_id, display_name) values (?, ?)", id, "Creator " + name);
        return id;
    }

    private UUID series(UUID creator, String slug, String publication, String visibility, String genre) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into drama_series (id, creator_id, title, slug, genre, visibility, publication_status, published_at)
                values (?, ?, ?, ?, ?, ?, ?, case when ? = 'PUBLISHED' then now() else null end)
                """, id, creator, "Series " + slug, slug, genre, visibility, publication, publication);
        return id;
    }

    private UUID season(UUID series, int number) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into drama_seasons (id, series_id, season_number) values (?, ?, ?)", id, series, number);
        return id;
    }

    private record V(UUID creator, UUID series, UUID season, Integer episode, String type, String slug, String visibility,
                     String publication, String genre, long views, boolean deleted, int publishedHoursAgo) {

        static V movie(UUID creator, String slug, String visibility, String publication, String genre) {
            return new V(creator, null, null, null, "MOVIE", slug, visibility, publication, genre, 0, false, 1);
        }

        V withViews(long n) { return new V(creator, series, season, episode, type, slug, visibility, publication, genre, n, deleted, publishedHoursAgo); }
        V asDeleted() { return new V(creator, series, season, episode, type, slug, visibility, publication, genre, views, true, publishedHoursAgo); }
        V hoursAgo(int h) { return new V(creator, series, season, episode, type, slug, visibility, publication, genre, views, deleted, h); }
        V episode(UUID series, UUID season, int number) {
            return new V(creator, series, season, number, "EPISODE", slug, visibility, publication, genre, views, deleted, publishedHoursAgo);
        }
    }

    private UUID insert(V v) {
        UUID id = UUID.randomUUID();
        boolean processed = v.publication().equals("READY") || v.publication().equals("PUBLISHED");
        jdbc.update("""
                insert into videos (id, creator_id, series_id, season_id, episode_number, video_type, title, slug, genre,
                                    visibility, publication_status, processing_status, is_ai_generated, view_count,
                                    published_at, deleted_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?,
                        case when ? = 'PUBLISHED' then now() - make_interval(hours => ?) else null end,
                        case when ? then now() else null end)
                """,
                id, v.creator(), v.series(), v.season(), v.episode(), v.type(), "Title " + v.slug(), v.slug(), v.genre(),
                v.visibility(), v.publication(), processed ? "READY" : "PENDING", v.views(),
                v.publication(), v.publishedHoursAgo(), v.deleted());
        return id;
    }

    private static String uniq(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    private List<String> slugs(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.data[*].slug");
    }

    private MvcResult list(String genre, String... extraParams) throws Exception {
        var req = get("/api/v1/videos").param("genre", genre).param("pageSize", "50");
        for (int i = 0; i < extraParams.length; i += 2) {
            req.param(extraParams[i], extraParams[i + 1]);
        }
        return mvc.perform(req).andExpect(status().isOk()).andReturn();
    }

    // ---- standalone videos ----

    @Test
    void listsOnlyPublishedPublicNotDeletedVideos() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        String ok = uniq("public");
        insert(V.movie(c, ok, "PUBLIC", "PUBLISHED", genre));
        String unlisted = uniq("unlisted");
        insert(V.movie(c, unlisted, "UNLISTED", "PUBLISHED", genre));
        String priv = uniq("private");
        insert(V.movie(c, priv, "PRIVATE", "PUBLISHED", genre));
        String draft = uniq("draft");
        insert(V.movie(c, draft, "PUBLIC", "DRAFT", genre));
        String ready = uniq("ready");
        insert(V.movie(c, ready, "PUBLIC", "READY", genre));
        String unpublished = uniq("unpublished");
        insert(V.movie(c, unpublished, "PUBLIC", "UNPUBLISHED", genre));
        String removed = uniq("removed");
        insert(V.movie(c, removed, "PUBLIC", "REMOVED", genre));
        String deleted = uniq("deleted");
        insert(V.movie(c, deleted, "PUBLIC", "PUBLISHED", genre).asDeleted());

        assertThat(slugs(list(genre))).containsExactly(ok);
    }

    @Test
    void directLinkRulesForWatchPage() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        String pub = uniq("public"), unl = uniq("unlisted"), priv = uniq("private"), draft = uniq("draft"), del = uniq("deleted"), unp = uniq("unpub");
        insert(V.movie(c, pub, "PUBLIC", "PUBLISHED", genre));
        insert(V.movie(c, unl, "UNLISTED", "PUBLISHED", genre));
        insert(V.movie(c, priv, "PRIVATE", "PUBLISHED", genre));
        insert(V.movie(c, draft, "PUBLIC", "DRAFT", genre));
        insert(V.movie(c, unp, "PUBLIC", "UNPUBLISHED", genre));
        insert(V.movie(c, del, "PUBLIC", "PUBLISHED", genre).asDeleted());

        mvc.perform(get("/api/v1/videos/" + pub)).andExpect(status().isOk()).andExpect(jsonPath("$.slug").value(pub));
        mvc.perform(get("/api/v1/videos/" + unl)).andExpect(status().isOk());
        for (String hidden : List.of(priv, draft, unp, del, "no-such-slug")) {
            mvc.perform(get("/api/v1/videos/" + hidden))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        }
    }

    @Test
    void filtersByTypeAndGenreAndSorts() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        String low = uniq("low"), mid = uniq("mid"), high = uniq("high"), shortOne = uniq("short");
        insert(V.movie(c, low, "PUBLIC", "PUBLISHED", genre).withViews(5).hoursAgo(1));
        insert(V.movie(c, mid, "PUBLIC", "PUBLISHED", genre).withViews(50).hoursAgo(3));
        insert(V.movie(c, high, "PUBLIC", "PUBLISHED", genre).withViews(500).hoursAgo(2));
        UUID shortId = insert(new V(c, null, null, null, "SHORT", shortOne, "PUBLIC", "PUBLISHED", genre, 1, false, 4));
        assertThat(shortId).isNotNull();

        assertThat(slugs(list(genre, "type", "MOVIE", "sort", "popular"))).containsExactly(high, mid, low);
        assertThat(slugs(list(genre, "type", "MOVIE", "sort", "recent"))).containsExactly(low, high, mid);
        assertThat(slugs(list(genre, "type", "SHORT"))).containsExactly(shortOne);
        assertThat(slugs(list(genre))).hasSize(4);
        assertThat(slugs(list("Unknown-" + genre))).isEmpty();
    }

    @Test
    void paginationEnvelopeReportsTotalsAndHasNext() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        for (int i = 0; i < 5; i++) {
            insert(V.movie(c, uniq("p" + i), "PUBLIC", "PUBLISHED", genre));
        }
        mvc.perform(get("/api/v1/videos").param("genre", genre).param("pageSize", "2").param("page", "1"))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.pagination.page").value(1))
                .andExpect(jsonPath("$.pagination.pageSize").value(2))
                .andExpect(jsonPath("$.pagination.totalItems").value(5))
                .andExpect(jsonPath("$.pagination.totalPages").value(3))
                .andExpect(jsonPath("$.pagination.hasNext").value(true));
        mvc.perform(get("/api/v1/videos").param("genre", genre).param("pageSize", "2").param("page", "3"))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.pagination.hasNext").value(false));
        mvc.perform(get("/api/v1/videos").param("genre", genre).param("pageSize", "2").param("page", "9"))
                .andExpect(jsonPath("$.data.length()").value(0))
                .andExpect(jsonPath("$.pagination.hasNext").value(false));
    }

    // ---- parent series access (episodes inherit) ----

    @Test
    void episodesInheritTheirParentSeriesAccess() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");

        record Case(String label, String seriesPublication, String seriesVisibility, boolean listed, boolean linkable) {}
        List<Case> cases = List.of(
                new Case("public", "PUBLISHED", "PUBLIC", true, true),
                new Case("unlisted", "PUBLISHED", "UNLISTED", false, true),
                new Case("private", "PUBLISHED", "PRIVATE", false, false),
                new Case("draft", "DRAFT", "PUBLIC", false, false),
                new Case("unpublished", "UNPUBLISHED", "PUBLIC", false, false));

        for (Case tc : cases) {
            UUID s = series(c, uniq("s-" + tc.label()), tc.seriesPublication(), tc.seriesVisibility(), genre);
            UUID season = season(s, 1);
            String slug = uniq("ep-" + tc.label());
            insert(V.movie(c, slug, "PUBLIC", "PUBLISHED", genre).episode(s, season, 1));

            assertThat(slugs(list(genre, "type", "EPISODE")).contains(slug))
                    .as("listed in /videos for %s series", tc.label())
                    .isEqualTo(tc.listed());
            int expected = tc.linkable() ? 200 : 404;
            assertThat(mvc.perform(get("/api/v1/videos/" + slug)).andReturn().getResponse().getStatus())
                    .as("GET /videos/{slug} for %s series", tc.label())
                    .isEqualTo(expected);
        }
    }

    // ---- series ----

    @Test
    void seriesListHidesNonPublicSeriesAndCountsOnlyVisibleEpisodes() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        String pubSlug = uniq("pub-series");
        UUID pub = series(c, pubSlug, "PUBLISHED", "PUBLIC", genre);
        UUID s1 = season(pub, 1);
        UUID s2 = season(pub, 2);
        insert(V.movie(c, uniq("e1"), "PUBLIC", "PUBLISHED", genre).episode(pub, s1, 1));
        insert(V.movie(c, uniq("e2"), "PUBLIC", "PUBLISHED", genre).episode(pub, s1, 2));
        insert(V.movie(c, uniq("e3"), "PUBLIC", "PUBLISHED", genre).episode(pub, s2, 1));
        insert(V.movie(c, uniq("draft-ep"), "PUBLIC", "DRAFT", genre).episode(pub, s2, 2));
        insert(V.movie(c, uniq("private-ep"), "PRIVATE", "PUBLISHED", genre).episode(pub, s2, 3));
        insert(V.movie(c, uniq("deleted-ep"), "PUBLIC", "PUBLISHED", genre).episode(pub, s2, 4).asDeleted());

        String unlistedSlug = uniq("unlisted-series"), privSlug = uniq("private-series"), draftSlug = uniq("draft-series");
        series(c, unlistedSlug, "PUBLISHED", "UNLISTED", genre);
        series(c, privSlug, "PUBLISHED", "PRIVATE", genre);
        series(c, draftSlug, "DRAFT", "PUBLIC", genre);

        MvcResult result = mvc.perform(get("/api/v1/series").param("genre", genre))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pagination.totalItems").value(1))
                .andExpect(jsonPath("$.data[0].slug").value(pubSlug))
                .andExpect(jsonPath("$.data[0].seasonCount").value(2))
                .andExpect(jsonPath("$.data[0].episodeCount").value(3))
                .andExpect(jsonPath("$.data[0].genre").value(genre))
                .andExpect(jsonPath("$.data[0].creator.displayName").value("Creator owner"))
                .andReturn();
        assertThat(result.getResponse().getContentAsString()).doesNotContain(unlistedSlug, privSlug, draftSlug);
    }

    @Test
    void seriesDetailReturnsOrderedEpisodesAndHonoursAccess() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        String slug = uniq("detail");
        UUID s = series(c, slug, "PUBLISHED", "PUBLIC", genre);
        UUID season1 = season(s, 1);
        UUID season2 = season(s, 2);
        String s2e1 = uniq("s2e1"), s1e2 = uniq("s1e2"), s1e1 = uniq("s1e1");
        insert(V.movie(c, s2e1, "PUBLIC", "PUBLISHED", genre).episode(s, season2, 1));
        insert(V.movie(c, s1e2, "PUBLIC", "PUBLISHED", genre).episode(s, season1, 2));
        insert(V.movie(c, s1e1, "PUBLIC", "PUBLISHED", genre).episode(s, season1, 1));
        insert(V.movie(c, uniq("hidden"), "PRIVATE", "PUBLISHED", genre).episode(s, season1, 3));

        MvcResult result = mvc.perform(get("/api/v1/series/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.series.slug").value(slug))
                .andExpect(jsonPath("$.series.episodeCount").value(3))
                .andExpect(jsonPath("$.series.seasonCount").value(2))
                .andExpect(jsonPath("$.episodes.length()").value(3))
                .andReturn();
        List<String> order = JsonPath.read(result.getResponse().getContentAsString(), "$.episodes[*].slug");
        assertThat(order).containsExactly(s1e1, s1e2, s2e1);
        List<Integer> seasons = JsonPath.read(result.getResponse().getContentAsString(), "$.episodes[*].seasonNumber");
        assertThat(seasons).containsExactly(1, 1, 2);

        String unlisted = uniq("unlisted"), priv = uniq("private"), draft = uniq("draft");
        series(c, unlisted, "PUBLISHED", "UNLISTED", genre);
        series(c, priv, "PUBLISHED", "PRIVATE", genre);
        series(c, draft, "DRAFT", "PUBLIC", genre);
        mvc.perform(get("/api/v1/series/" + unlisted)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/series/" + priv)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/series/" + draft)).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/series/nope-" + genre)).andExpect(status().isNotFound());
    }

    // ---- home ----

    @Test
    void homeFeedHasFeaturedRailsAndStatsWithoutDuplicatingFeatured() throws Exception {
        String genre = uniq("G");
        UUID c = creator("owner");
        String newest = uniq("newest");
        insert(V.movie(c, newest, "PUBLIC", "PUBLISHED", genre).withViews(1).hoursAgo(0));
        for (int i = 0; i < 3; i++) {
            insert(V.movie(c, uniq("older" + i), "PUBLIC", "PUBLISHED", genre).withViews(10L * (i + 1)).hoursAgo(10 + i));
        }

        MvcResult result = mvc.perform(get("/api/v1/home"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.featured.video.slug").value(newest))
                .andExpect(jsonPath("$.featured.kicker").value("Featured " + genre))
                .andExpect(jsonPath("$.featured.backdropUrl").value(""))
                .andExpect(jsonPath("$.featured.tagline").isNotEmpty())
                .andExpect(jsonPath("$.stats[0].label").value("Videos"))
                .andExpect(jsonPath("$.stats[1].label").value("Creators"))
                .andExpect(jsonPath("$.stats[2].label").value("Views"))
                .andReturn();
        String body = result.getResponse().getContentAsString();
        List<String> trending = JsonPath.read(body, "$.trending[*].slug");
        List<String> originals = JsonPath.read(body, "$.originals[*].slug");
        assertThat(trending).doesNotContain(newest).hasSizeLessThanOrEqualTo(8);
        assertThat(originals).doesNotContain(newest).hasSizeLessThanOrEqualTo(8);
    }

    @Test
    void unknownRoutesUseTheErrorEnvelope() throws Exception {
        TestUser user = registerUser();
        mvc.perform(authedGet(user, "/api/v1/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.error.requestId").isNotEmpty());
    }
}
