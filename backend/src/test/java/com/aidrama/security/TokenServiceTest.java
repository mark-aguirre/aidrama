package com.aidrama.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.aidrama.config.AppProperties;
import com.aidrama.user.Role;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class TokenServiceTest {

    private static final String SECRET = "unit-test-secret-unit-test-secret-0123456789";

    private static AppProperties props(String secret, String issuer, String audience, Duration accessTtl) {
        return new AppProperties(
                new AppProperties.Auth(secret, issuer, audience, accessTtl, Duration.ofDays(14), Duration.ofDays(30), Duration.ofHours(24)),
                null, null, null, null, null, null, null);
    }

    private static TokenService service(String secret, String issuer, String audience, Duration accessTtl, Clock clock) {
        return new TokenService(props(secret, issuer, audience, accessTtl), clock);
    }

    private final TokenService tokens = service(SECRET, "aidrama", "aidrama-api", Duration.ofMinutes(15), Clock.systemUTC());

    @Test
    void accessTokenRoundTripCarriesSubjectAndRoles() {
        UUID id = UUID.randomUUID();
        String token = tokens.issueAccessToken(id, List.of(Role.USER, Role.CREATOR));

        Jwt jwt = tokens.parse(token, TokenUse.ACCESS);

        assertThat(jwt.getSubject()).isEqualTo(id.toString());
        assertThat(jwt.getClaimAsStringList(TokenService.CLAIM_ROLES)).containsExactly("CREATOR", "USER");
        assertThat(AuthenticatedUser.from(jwt).has(Role.CREATOR)).isTrue();
        assertThat(AuthenticatedUser.from(jwt).has(Role.ADMIN)).isFalse();
    }

    @Test
    void tokenIsOnlyValidForItsOwnPurpose() {
        UUID id = UUID.randomUUID();
        String access = tokens.issueAccessToken(id, List.of(Role.USER));
        String refresh = tokens.issueRefreshToken(id, Instant.now());
        String verify = tokens.issueEmailVerificationToken(id, "a@example.test");

        assertThatThrownBy(() -> tokens.parse(refresh, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
        assertThatThrownBy(() -> tokens.parse(verify, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
        assertThatThrownBy(() -> tokens.parse(access, TokenUse.REFRESH)).isInstanceOf(InvalidTokenException.class);
        assertThatThrownBy(() -> tokens.parse(access, TokenUse.EMAIL_VERIFY)).isInstanceOf(InvalidTokenException.class);
        assertThat(tokens.parse(refresh, TokenUse.REFRESH).getSubject()).isEqualTo(id.toString());
    }

    @Test
    void rejectsExpiredToken() {
        Clock past = Clock.fixed(Instant.now().minus(Duration.ofHours(2)), ZoneOffset.UTC);
        String expired = service(SECRET, "aidrama", "aidrama-api", Duration.ofMinutes(15), past)
                .issueAccessToken(UUID.randomUUID(), List.of(Role.USER));

        assertThatThrownBy(() -> tokens.parse(expired, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void rejectsTokenSignedWithAnotherSecret() {
        String forged = service("another-secret-another-secret-0123456789", "aidrama", "aidrama-api", Duration.ofMinutes(15), Clock.systemUTC())
                .issueAccessToken(UUID.randomUUID(), List.of(Role.ADMIN));

        assertThatThrownBy(() -> tokens.parse(forged, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void rejectsWrongIssuerAndWrongAudience() {
        String wrongIssuer = service(SECRET, "someone-else", "aidrama-api", Duration.ofMinutes(15), Clock.systemUTC())
                .issueAccessToken(UUID.randomUUID(), List.of(Role.USER));
        String wrongAudience = service(SECRET, "aidrama", "other-api", Duration.ofMinutes(15), Clock.systemUTC())
                .issueAccessToken(UUID.randomUUID(), List.of(Role.USER));

        assertThatThrownBy(() -> tokens.parse(wrongIssuer, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
        assertThatThrownBy(() -> tokens.parse(wrongAudience, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void rejectsTamperedPayload() {
        String token = tokens.issueAccessToken(UUID.randomUUID(), List.of(Role.USER));
        String[] parts = token.split("\\.");
        String evilPayload = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                "{\"sub\":\"x\",\"roles\":[\"ADMIN\"]}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String tampered = parts[0] + "." + evilPayload + "." + parts[2];

        assertThatThrownBy(() -> tokens.parse(tampered, TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
        assertThatThrownBy(() -> tokens.parse("not-a-jwt", TokenUse.ACCESS)).isInstanceOf(InvalidTokenException.class);
    }

    @Test
    void sessionAgeIsCappedByMaxSessionAge() {
        assertThat(tokens.sessionTooOld(Instant.now().minus(Duration.ofDays(31)))).isTrue();
        assertThat(tokens.sessionTooOld(Instant.now().minus(Duration.ofDays(29)))).isFalse();
    }
}
