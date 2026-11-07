package com.aidrama.support;

import com.jayway.jsonpath.JsonPath;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full application against a real PostgreSQL 16 (Testcontainers), migrated by the DB engineer's
 * Liquibase changelog and checked by Hibernate {@code ddl-auto=validate}. The container is shared by
 * all integration tests in the JVM. Object storage is replaced by {@link FakeObjectStorage}.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestStorageConfig.class)
public abstract class IntegrationTestBase {

    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:16-alpine");

    static {
        POSTGRES.start();
        Runtime.getRuntime().addShutdownHook(new Thread(POSTGRES::stop));
    }

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl() + "&options=-c%20timezone=UTC");
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected FakeObjectStorage storage;

    @BeforeEach
    void resetStorage() {
        storage.clear();
    }

    /** A registered account with the tokens returned by {@code POST /auth/register}. */
    public record TestUser(UUID id, String email, String username, String accessToken, String refreshToken) {}

    protected TestUser registerUser() throws Exception {
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        return registerUser("user_" + suffix, "user_" + suffix + "@example.test");
    }

    protected TestUser registerUser(String username, String email) throws Exception {
        String body = """
                {"email":"%s","username":"%s","displayName":"Test %s","password":"correct-horse-battery"}
                """.formatted(email, username, username);
        MvcResult result = mvc.perform(post("/api/v1/auth/register").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andReturn();
        String json = result.getResponse().getContentAsString();
        return new TestUser(
                UUID.fromString(JsonPath.read(json, "$.user.id")),
                email,
                username,
                JsonPath.read(json, "$.accessToken"),
                JsonPath.read(json, "$.refreshToken"));
    }

    protected static String bearer(TestUser user) {
        return "Bearer " + user.accessToken();
    }

    protected static <T> T json(MvcResult result, String path) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), path);
    }

    protected MockHttpServletRequestBuilder authedGet(TestUser user, String url) {
        return get(url).header("Authorization", bearer(user));
    }

    protected MockHttpServletRequestBuilder authedPost(TestUser user, String url, String body) {
        return post(url).header("Authorization", bearer(user)).contentType(MediaType.APPLICATION_JSON).content(body);
    }
}
