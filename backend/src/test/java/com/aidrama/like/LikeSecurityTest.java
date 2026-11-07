package com.aidrama.like;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.common.exception.ErrorResponseWriter;
import com.aidrama.common.exception.GlobalExceptionHandler;
import com.aidrama.config.AppProperties;
import com.aidrama.like.LikeDtos.LikeStateResponse;
import com.aidrama.security.SecurityConfig;
import com.aidrama.security.TokenService;
import com.aidrama.user.Role;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The real {@link SecurityConfig} filter chain in front of the like routes, without a database: no token and a
 * bad token are 401, a valid access token reaches the controller. The refresh token case shows that only access
 * tokens are accepted. Only the service is mocked.
 */
@WebMvcTest
@ActiveProfiles("test")
class LikeSecurityTest {

    private static final String URL = "/api/v1/videos/beyond-abc12345/like";

    /**
     * Replaces the application class for this slice, so no database is needed. Properties come from the
     * "test" profile (throwaway values), bound and validated like in the real application.
     */
    @Configuration
    @EnableConfigurationProperties(AppProperties.class)
    @Import({LikeController.class, SecurityConfig.class, ErrorResponseWriter.class, GlobalExceptionHandler.class, TokenService.class})
    static class Config {}

    @Autowired
    MockMvc mvc;

    @Autowired
    TokenService tokens;

    @MockitoBean
    LikeService service;

    @Test
    void anonymousPostAndDeleteAre401AndNeverReachTheService() throws Exception {
        mvc.perform(post(URL))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(delete(URL))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));

        verifyNoInteractions(service);
    }

    @Test
    void garbageAndWrongPurposeTokensAre401() throws Exception {
        String refresh = tokens.issueRefreshToken(UUID.randomUUID(), java.time.Instant.now());

        mvc.perform(post(URL).header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
        mvc.perform(post(URL).header("Authorization", "Bearer " + refresh)).andExpect(status().isUnauthorized());
        mvc.perform(delete(URL).header("Authorization", "Bearer " + refresh)).andExpect(status().isUnauthorized());

        verifyNoInteractions(service);
    }

    @Test
    void validAccessTokenReachesTheController() throws Exception {
        String access = tokens.issueAccessToken(UUID.randomUUID(), List.of(Role.USER));
        when(service.like(any(), any())).thenReturn(new LikeStateResponse(true, 7));
        when(service.unlike(any(), any())).thenReturn(new LikeStateResponse(false, 6));

        mvc.perform(post(URL).header("Authorization", "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.likeCount").value(7));
        mvc.perform(delete(URL).header("Authorization", "Bearer " + access))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.likeCount").value(6));
    }
}
