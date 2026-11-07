package com.aidrama.video;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.aidrama.common.exception.ConflictException;
import com.aidrama.common.exception.GlobalExceptionHandler;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.security.TokenService;
import com.aidrama.user.Role;
import com.aidrama.video.VideoDtos.LinkTrailerRequest;
import com.aidrama.video.VideoDtos.TrailerResponse;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.time.Instant;
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
 * Transport contract of the trailer endpoints: routes, status codes, JSON shape, validation and the
 * error envelope. The caller comes only from the token. Route-level 401/403 rules live in
 * SecurityConfig and are not exercised here.
 */
class CreatorVideoControllerTrailerTest {

    private final CreatorVideoService service = mock(CreatorVideoService.class);
    private final UUID creatorId = UUID.randomUUID();
    private final UUID titleId = UUID.randomUUID();
    private final UUID trailerId = UUID.randomUUID();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(creatorId.toString())
                .claim(TokenService.CLAIM_ROLES, List.of("USER", "CREATOR"))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
        mvc = MockMvcBuilders.standaloneSetup(new CreatorVideoController(service))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    private VideoResponse titleWith(UUID linkedTrailerId, TrailerResponse trailer) {
        return new VideoResponse(titleId, "beyond-abc12345", "Beyond", "", VideoType.MOVIE, null, "https://cdn.test/main.m3u8",
                600, "Drama", "en", Visibility.PUBLIC, PublicationStatus.PUBLISHED, ProcessingStatus.READY, true, 0, 0, false,
                Instant.parse("2026-11-07T00:00:00Z"), Instant.parse("2026-11-06T00:00:00Z"), null, null, null, 7,
                linkedTrailerId, trailer);
    }

    private AuthenticatedUser caller() {
        return new AuthenticatedUser(creatorId, Set.of(Role.USER, Role.CREATOR));
    }

    @Test
    void linkReturnsTheTitleWithItsPlayableTrailer() throws Exception {
        TrailerResponse trailer = new TrailerResponse(trailerId, "Beyond: Trailer", "https://cdn.test/trailer.m3u8", null, 45);
        when(service.linkTrailer(eq(caller()), eq(titleId), any(LinkTrailerRequest.class))).thenReturn(titleWith(trailerId, trailer));

        mvc.perform(post("/api/v1/creator/videos/{id}/trailer", titleId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"trailerVideoId\":\"" + trailerId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(titleId.toString()))
                .andExpect(jsonPath("$.version").value(7))
                .andExpect(jsonPath("$.trailerVideoId").value(trailerId.toString()))
                .andExpect(jsonPath("$.trailer.id").value(trailerId.toString()))
                .andExpect(jsonPath("$.trailer.hlsUrl").value("https://cdn.test/trailer.m3u8"))
                .andExpect(jsonPath("$.trailer.durationSeconds").value(45));

        verify(service).linkTrailer(eq(caller()), eq(titleId), eq(new LinkTrailerRequest(trailerId)));
    }

    @Test
    void aTitleWithoutAPlayableTrailerSerializesNulls() throws Exception {
        when(service.linkTrailer(eq(caller()), eq(titleId), any())).thenReturn(titleWith(trailerId, null));

        mvc.perform(post("/api/v1/creator/videos/{id}/trailer", titleId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"trailerVideoId\":\"" + trailerId + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.trailerVideoId").value(trailerId.toString()))
                .andExpect(jsonPath("$.trailer").value((Object) null));
    }

    @Test
    void linkWithoutATrailerIdIsA400WithTheFieldNamed() throws Exception {
        mvc.perform(post("/api/v1/creator/videos/{id}/trailer", titleId).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.error.details[0].field").value("trailerVideoId"));
    }

    @Test
    void linkWithAMalformedIdIsA400() throws Exception {
        mvc.perform(post("/api/v1/creator/videos/{id}/trailer", titleId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"trailerVideoId\":\"not-a-uuid\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void aBodyCannotChooseTheCreator() throws Exception {
        when(service.linkTrailer(any(), any(), any())).thenReturn(titleWith(null, null));

        mvc.perform(post("/api/v1/creator/videos/{id}/trailer", titleId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"trailerVideoId\":\"" + trailerId + "\",\"creatorId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk());

        verify(service).linkTrailer(eq(caller()), eq(titleId), eq(new LinkTrailerRequest(trailerId)));
    }

    @Test
    void aTrailerAlreadyLinkedElsewhereIsA409InTheErrorEnvelope() throws Exception {
        when(service.linkTrailer(any(), any(), any()))
                .thenThrow(new ConflictException("TRAILER_ALREADY_LINKED", "This trailer is already linked to another video."));

        mvc.perform(post("/api/v1/creator/videos/{id}/trailer", titleId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"trailerVideoId\":\"" + trailerId + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("TRAILER_ALREADY_LINKED"))
                .andExpect(jsonPath("$.error.details").isArray());
    }

    @Test
    void unlinkReturnsTheUpdatedTitle() throws Exception {
        when(service.unlinkTrailer(eq(caller()), eq(titleId))).thenReturn(titleWith(null, null));

        mvc.perform(delete("/api/v1/creator/videos/{id}/trailer", titleId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(titleId.toString()))
                .andExpect(jsonPath("$.trailerVideoId").value((Object) null))
                .andExpect(jsonPath("$.trailer").value((Object) null));
    }
}
