package com.aidrama.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.security.TokenService;
import com.aidrama.support.IntegrationTestBase;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

class AuthFlowIT extends IntegrationTestBase {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    TokenService tokens;

    private static String register(String email, String username, String password) {
        return """
                {"email":"%s","username":"%s","displayName":"Ada","password":"%s"}
                """.formatted(email, username, password);
    }

    @Test
    void registerCreatesUserProfileAndDefaultRolesAndHashesPassword() throws Exception {
        String username = "ada_" + UUID.randomUUID().toString().substring(0, 8);
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(register("Ada." + username + "@Example.Test", username, "correct-horse-battery")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.user.email").value("ada." + username + "@example.test"))
                .andExpect(jsonPath("$.user.username").value(username))
                .andExpect(jsonPath("$.user.displayName").value("Ada"))
                .andExpect(jsonPath("$.user.emailVerified").value(false))
                .andExpect(jsonPath("$.user.roles[0]").value("CREATOR"))
                .andExpect(jsonPath("$.user.roles[1]").value("USER"))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        String hash = jdbc.queryForObject("select password_hash from users where username = ?", String.class, username);
        assertThat(hash).startsWith("{bcrypt}$2").doesNotContain("correct-horse-battery");
        Integer profiles = jdbc.queryForObject(
                "select count(*) from user_profiles p join users u on u.id = p.user_id where u.username = ?", Integer.class, username);
        assertThat(profiles).isEqualTo(1);
        List<String> roles = jdbc.queryForList(
                "select r.role from user_roles r join users u on u.id = r.user_id where u.username = ? order by r.role", String.class, username);
        assertThat(roles).containsExactly("CREATOR", "USER");
    }

    @Test
    void duplicateEmailAndUsernameReturn409WithFieldDetails() throws Exception {
        TestUser existing = registerUser();

        MvcResult result = mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(register(existing.email().toUpperCase(), existing.username(), "correct-horse-battery")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("DUPLICATE_RESOURCE"))
                .andExpect(jsonPath("$.error.requestId").isNotEmpty())
                .andReturn();
        String body = result.getResponse().getContentAsString();
        assertThat(body).contains("\"field\":\"email\"").contains("\"field\":\"username\"");
        assertThat(body).doesNotContain("uq_users").doesNotContain("SQL");
    }

    @Test
    void registrationValidationErrorsListEveryField() throws Exception {
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"not-an-email\",\"username\":\"Bad Name\",\"displayName\":\"\",\"password\":\"short\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.details[?(@.field=='email')]").exists())
                .andExpect(jsonPath("$.error.details[?(@.field=='username')]").exists())
                .andExpect(jsonPath("$.error.details[?(@.field=='displayName')]").exists())
                .andExpect(jsonPath("$.error.details[?(@.field=='password')]").exists());
    }

    @Test
    void passwordLongerThanBcryptLimitInBytesIsRejected() throws Exception {
        String multibyte = "é".repeat(40); // 40 chars, 80 bytes
        mvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(register("long@example.test", "long_pw_user", multibyte)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.details[0].field").value("password"));
    }

    @Test
    void loginSucceedsAndBadCredentialsAreIndistinguishable() throws Exception {
        TestUser user = registerUser();

        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + user.email().toUpperCase() + "\",\"password\":\"correct-horse-battery\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.user.id").value(user.id().toString()));

        String wrongPassword = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + user.email() + "\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();
        String unknownEmail = mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@example.test\",\"password\":\"wrong-password\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"))
                .andReturn().getResponse().getContentAsString();
        assertThat(wrongPassword.replaceAll("\"requestId\":\"[^\"]+\"", "")).isEqualTo(unknownEmail.replaceAll("\"requestId\":\"[^\"]+\"", ""));
    }

    @Test
    void overlongPasswordOnLoginIsAnOrdinary401NotAServerError() throws Exception {
        TestUser user = registerUser();
        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + user.email() + "\",\"password\":\"" + "é".repeat(40) + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void suspendedAccountCannotLogInOrRefresh() throws Exception {
        TestUser user = registerUser();
        jdbc.update("update users set account_status = 'SUSPENDED' where id = ?", user.id());

        mvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"" + user.email() + "\",\"password\":\"correct-horse-battery\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("ACCOUNT_SUSPENDED"));
        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + user.refreshToken() + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void meRequiresAValidAccessToken() throws Exception {
        TestUser user = registerUser();

        mvc.perform(authedGet(user, "/api/v1/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(user.id().toString()))
                .andExpect(jsonPath("$.email").value(user.email()));

        mvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.error.requestId").isNotEmpty());
        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer garbage"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshTokenCannotBeUsedAsAccessTokenAndViceVersa() throws Exception {
        TestUser user = registerUser();

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + user.refreshToken()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + user.accessToken() + "\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("INVALID_REFRESH_TOKEN"));
    }

    @Test
    void refreshIssuesANewWorkingTokenPair() throws Exception {
        TestUser user = registerUser();

        MvcResult refreshed = mvc.perform(post("/api/v1/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + user.refreshToken() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.id").value(user.id().toString()))
                .andReturn();
        String newAccess = json(refreshed, "$.accessToken");

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + newAccess)).andExpect(status().isOk());
    }

    @Test
    void emailVerificationFlow() throws Exception {
        TestUser user = registerUser();
        String token = tokens.issueEmailVerificationToken(user.id(), user.email());

        mvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isNoContent());
        // Idempotent.
        mvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(authedGet(user, "/api/v1/auth/me")).andExpect(jsonPath("$.emailVerified").value(true));
        mvc.perform(authedPost(user, "/api/v1/auth/resend-verification", "{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("EMAIL_ALREADY_VERIFIED"));
    }

    @Test
    void verificationRejectsGarbageAndAccessTokens() throws Exception {
        TestUser user = registerUser();
        for (String bad : new String[] {"garbage", user.accessToken(), user.refreshToken()}) {
            mvc.perform(post("/api/v1/auth/verify-email")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"token\":\"" + bad + "\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.code").value("INVALID_VERIFICATION_TOKEN"));
        }
    }

    @Test
    void verificationTokenForAChangedEmailIsRejected() throws Exception {
        TestUser user = registerUser();
        String token = tokens.issueEmailVerificationToken(user.id(), "someone.else@example.test");
        mvc.perform(post("/api/v1/auth/verify-email")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + token + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resendVerificationAcceptedForUnverifiedUser() throws Exception {
        TestUser user = registerUser();
        mvc.perform(authedPost(user, "/api/v1/auth/resend-verification", "{}")).andExpect(status().isAccepted());
    }

    @Test
    void logoutIsIdempotentAndPublic() throws Exception {
        mvc.perform(post("/api/v1/auth/logout")).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/auth/logout").contentType(MediaType.APPLICATION_JSON).content("{\"refreshToken\":\"x\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    void requestIdIsEchoedAndGeneratedAndUnsafeValuesAreReplaced() throws Exception {
        mvc.perform(get("/api/v1/auth/me").header("X-Request-ID", "client-req-12345678"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.requestId").value("client-req-12345678"));
        MvcResult generated = mvc.perform(get("/api/v1/auth/me").header("X-Request-ID", "bad value\nwith newline"))
                .andExpect(status().isUnauthorized())
                .andReturn();
        assertThat(generated.getResponse().getHeader("X-Request-ID")).matches("^[0-9a-f-]{36}$");
    }

    @Test
    void malformedJsonAndUnknownRoutesUseTheErrorEnvelope() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON).content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("MALFORMED_REQUEST"));
        mvc.perform(get("/api/v1/does-not-exist").header("Authorization", "Bearer garbage")).andExpect(status().isUnauthorized());
    }
}
