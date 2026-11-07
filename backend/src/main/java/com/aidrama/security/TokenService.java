package com.aidrama.security;

import com.aidrama.config.AppProperties;
import com.aidrama.user.Role;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Service;

/**
 * Issues and validates the three kinds of signed token the API uses: access, refresh and
 * email verification. All are HS256 JWTs signed with the secret from {@code AIDRAMA_JWT_SECRET}.
 *
 * <p>Every token carries a {@code token_use} claim. Validation rejects a token whose purpose does
 * not match, so a refresh token can never be presented as a bearer access token.
 */
@Service
public class TokenService {

    public static final String CLAIM_USE = "token_use";
    public static final String CLAIM_ROLES = "roles";
    public static final String CLAIM_AUTH_TIME = "auth_time";
    public static final String CLAIM_EMAIL = "email";

    private final AppProperties.Auth props;
    private final Clock clock;
    private final JwtEncoder encoder;
    private final SecretKey key;
    private final Map<TokenUse, JwtDecoder> decoders = new EnumMap<>(TokenUse.class);

    public TokenService(AppProperties properties, Clock clock) {
        this.props = properties.auth();
        this.clock = clock;
        this.key = new SecretKeySpec(props.jwtSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        for (TokenUse use : TokenUse.values()) {
            decoders.put(use, buildDecoder(use));
        }
    }

    public Duration accessTokenTtl() {
        return props.accessTokenTtl();
    }

    public String issueAccessToken(UUID userId, Collection<Role> roles) {
        Instant now = clock.instant();
        return encode(JwtClaimsSet.builder()
                .subject(userId.toString())
                .claim(CLAIM_USE, TokenUse.ACCESS.claimValue())
                .claim(CLAIM_ROLES, roles.stream().map(Enum::name).sorted().toList()),
                now,
                props.accessTokenTtl());
    }

    /** {@code authTime} is the original login time. It is carried over on refresh to cap the session age. */
    public String issueRefreshToken(UUID userId, Instant authTime) {
        return encode(JwtClaimsSet.builder()
                .subject(userId.toString())
                .claim(CLAIM_USE, TokenUse.REFRESH.claimValue())
                .claim(CLAIM_AUTH_TIME, authTime.getEpochSecond()),
                clock.instant(),
                props.refreshTokenTtl());
    }

    public String issueEmailVerificationToken(UUID userId, String email) {
        return encode(JwtClaimsSet.builder()
                .subject(userId.toString())
                .claim(CLAIM_USE, TokenUse.EMAIL_VERIFY.claimValue())
                .claim(CLAIM_EMAIL, email),
                clock.instant(),
                props.emailVerificationTtl());
    }

    /** Validates signature, expiry, issuer, audience and purpose. */
    public Jwt parse(String token, TokenUse expected) {
        try {
            return decoderFor(expected).decode(token);
        } catch (JwtException ex) {
            throw new InvalidTokenException("Token rejected", ex);
        }
    }

    /** Decoder for the Spring Security resource server. Accepts access tokens only. */
    public JwtDecoder accessTokenDecoder() {
        return decoderFor(TokenUse.ACCESS);
    }

    /** True when the session started by a refresh token is older than the configured maximum. */
    public boolean sessionTooOld(Instant authTime) {
        return authTime.plus(props.maxSessionAge()).isBefore(clock.instant());
    }

    private JwtDecoder decoderFor(TokenUse use) {
        return decoders.get(use);
    }

    private JwtDecoder buildDecoder(TokenUse use) {
        NimbusJwtDecoder decoder =
                NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> audience = jwt -> {
            List<String> aud = jwt.getAudience();
            return aud != null && aud.contains(props.audience())
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong audience", null));
        };
        OAuth2TokenValidator<Jwt> purpose = jwt ->
                use.claimValue().equals(jwt.getClaimAsString(CLAIM_USE))
                        ? OAuth2TokenValidatorResult.success()
                        : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Wrong token type", null));
        decoder.setJwtValidator(
                new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(props.issuer()), audience, purpose));
        return decoder;
    }

    private String encode(JwtClaimsSet.Builder claims, Instant now, Duration ttl) {
        JwtClaimsSet set = claims.issuer(props.issuer())
                .audience(List.of(props.audience()))
                .issuedAt(now)
                .expiresAt(now.plus(ttl))
                .id(UUID.randomUUID().toString())
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), set))
                .getTokenValue();
    }
}
