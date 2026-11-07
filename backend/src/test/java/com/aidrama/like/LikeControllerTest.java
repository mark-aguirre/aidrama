package com.aidrama.like;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.common.exception.GlobalExceptionHandler;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.like.LikeDtos.LikeStateResponse;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.security.TokenService;
import com.aidrama.user.Role;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Transport contract of {@code POST|DELETE /videos/{slug}/like}: routes, JSON shape, caller identity and the
 * error envelope. Route-level authentication lives in SecurityConfig and is covered by {@link LikeSecurityTest}.
 */
class LikeControllerTest {

    private static final String URL = "/api/v1/videos/{slug}/like";
    private static final String SLUG = "beyond-abc12345";

    private final LikeService service = mock(LikeService.class);
    private final UUID userId = UUID.randomUUID();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new LikeController(service))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private void signIn() {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(userId.toString())
                .claim(TokenService.CLAIM_ROLES, List.of("USER"))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }

    @Test
    void postLikesAsTheTokenUserAndReturnsTheStateAfter() throws Exception {
        signIn();
        when(service.like(eq(SLUG), any())).thenReturn(new LikeStateResponse(true, 42));

        mvc.perform(post(URL, SLUG))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(true))
                .andExpect(jsonPath("$.likeCount").value(42));

        verify(service).like(SLUG, new AuthenticatedUser(userId, Set.of(Role.USER)));
    }

    @Test
    void deleteUnlikesAsTheTokenUserAndReturnsTheStateAfter() throws Exception {
        signIn();
        when(service.unlike(eq(SLUG), any())).thenReturn(new LikeStateResponse(false, 41));

        mvc.perform(delete(URL, SLUG))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.liked").value(false))
                .andExpect(jsonPath("$.likeCount").value(41));

        verify(service).unlike(SLUG, new AuthenticatedUser(userId, Set.of(Role.USER)));
    }

    @Test
    void aUserIdInTheBodyOrQueryIsIgnored() throws Exception {
        signIn();
        when(service.like(eq(SLUG), any())).thenReturn(new LikeStateResponse(true, 1));

        mvc.perform(post(URL + "?userId={other}", SLUG, UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk());

        verify(service).like(SLUG, new AuthenticatedUser(userId, Set.of(Role.USER)));
    }

    @Test
    void noValidatedTokenIsA401InTheErrorEnvelopeAndTheServiceIsNotCalled() throws Exception {
        mvc.perform(post(URL, SLUG))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("UNAUTHENTICATED"));
        mvc.perform(delete(URL, SLUG)).andExpect(status().isUnauthorized());

        verifyNoInteractions(service);
    }

    @Test
    void unknownVideoIsA404InTheErrorEnvelope() throws Exception {
        signIn();
        when(service.like(any(), any())).thenThrow(new NotFoundException("Video"));
        when(service.unlike(any(), any())).thenThrow(new NotFoundException("Video"));

        mvc.perform(post(URL, "nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
        mvc.perform(delete(URL, "nope")).andExpect(status().isNotFound());
    }
}
