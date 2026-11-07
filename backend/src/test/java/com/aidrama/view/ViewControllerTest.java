package com.aidrama.view;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.common.exception.GlobalExceptionHandler;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.security.TokenService;
import com.aidrama.user.Role;
import com.aidrama.view.ViewDtos.RecordViewRequest;
import com.aidrama.view.ViewDtos.RecordViewResponse;
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
 * Transport contract of {@code POST /videos/{slug}/view-events}: route, JSON shape, validation and the error
 * envelope. Route-level permitAll lives in SecurityConfig and is not exercised here.
 */
class ViewControllerTest {

    private static final String URL = "/api/v1/videos/{slug}/view-events";
    private static final String SLUG = "beyond-abc12345";
    private static final String SESSION = "0b8f7c2e-3a41-4d5e-9f10-2c6b7d8e9a01";

    private final ViewService service = mock(ViewService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new ViewController(service))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private static String body(String eventType, Object watched, String sessionId) {
        return "{\"eventType\":" + (eventType == null ? "null" : "\"" + eventType + "\"")
                + ",\"watchedSeconds\":" + watched
                + (sessionId == null ? "" : ",\"sessionId\":\"" + sessionId + "\"") + "}";
    }

    @Test
    void anonymousCallerIsPassedAsNullViewerAndGetsRecordedAndCounted() throws Exception {
        when(service.record(eq(SLUG), any(RecordViewRequest.class), isNull())).thenReturn(new RecordViewResponse(true, true));

        mvc.perform(post(URL, SLUG).contentType(MediaType.APPLICATION_JSON).content(body("VIEW_QUALIFIED", 10, SESSION)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recorded").value(true))
                .andExpect(jsonPath("$.counted").value(true));

        verify(service).record(SLUG, new RecordViewRequest(ViewEventType.VIEW_QUALIFIED, 10, SESSION), null);
    }

    @Test
    void signedInCallerComesOnlyFromTheToken() throws Exception {
        UUID userId = UUID.randomUUID();
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(userId.toString())
                .claim(TokenService.CLAIM_ROLES, List.of("USER"))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
        when(service.record(eq(SLUG), any(), any())).thenReturn(new RecordViewResponse(true, false));

        mvc.perform(post(URL, SLUG)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventType\":\"PLAY_START\",\"watchedSeconds\":0,\"userId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counted").value(false));

        verify(service).record(
                SLUG,
                new RecordViewRequest(ViewEventType.PLAY_START, 0, null),
                new AuthenticatedUser(userId, Set.of(Role.USER)));
    }

    @Test
    void unknownVideoIsA404InTheErrorEnvelope() throws Exception {
        when(service.record(any(), any(), any())).thenThrow(new NotFoundException("Video"));

        mvc.perform(post(URL, "nope").contentType(MediaType.APPLICATION_JSON).content(body("VIEW_QUALIFIED", 30, SESSION)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.error.details").isArray());
    }

    @Test
    void missingEventTypeIsA400NamingTheField() throws Exception {
        mvc.perform(post(URL, SLUG).contentType(MediaType.APPLICATION_JSON).content(body(null, 10, SESSION)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.details[0].field").value("eventType"));
        verifyNoInteractions(service);
    }

    @Test
    void unknownEventTypeIsA400() throws Exception {
        mvc.perform(post(URL, SLUG).contentType(MediaType.APPLICATION_JSON).content(body("PAUSE", 10, SESSION)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("MALFORMED_REQUEST"));
        verifyNoInteractions(service);
    }

    @Test
    void negativeOrHugeWatchedSecondsAreA400() throws Exception {
        for (Object watched : new Object[] {-1, 86_401}) {
            mvc.perform(post(URL, SLUG).contentType(MediaType.APPLICATION_JSON).content(body("VIEW_QUALIFIED", watched, SESSION)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.details[0].field").value("watchedSeconds"));
        }
        verify(service, never()).record(any(), any(), any());
    }

    @Test
    void missingWatchedSecondsIsA400() throws Exception {
        mvc.perform(post(URL, SLUG)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"eventType\":\"PLAY_START\",\"sessionId\":\"" + SESSION + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.details[0].field").value("watchedSeconds"));
    }

    @Test
    void malformedSessionIdIsA400() throws Exception {
        for (String bad : new String[] {"short", "has spaces in it, not allowed!!", "x".repeat(65)}) {
            mvc.perform(post(URL, SLUG).contentType(MediaType.APPLICATION_JSON).content(body("PLAY_START", 0, bad)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error.details[0].field").value("sessionId"));
        }
        verifyNoInteractions(service);
    }
}
