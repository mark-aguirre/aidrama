package com.aidrama.auth;

import com.aidrama.auth.AuthDtos.AuthResponse;
import com.aidrama.auth.AuthDtos.AuthUserResponse;
import com.aidrama.auth.AuthDtos.LoginRequest;
import com.aidrama.auth.AuthDtos.RegisterRequest;
import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.ConflictException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.common.exception.ForbiddenException;
import com.aidrama.common.exception.UnauthorizedException;
import com.aidrama.config.AppProperties;
import com.aidrama.security.InvalidTokenException;
import com.aidrama.security.TokenService;
import com.aidrama.security.TokenUse;
import com.aidrama.user.AccountStatus;
import com.aidrama.user.Role;
import com.aidrama.user.User;
import com.aidrama.user.UserProfile;
import com.aidrama.user.UserProfileRepository;
import com.aidrama.user.UserRepository;
import com.aidrama.user.UserRole;
import com.aidrama.user.UserRoleRepository;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Registration, login, token refresh and email verification (spec 3.1, 7.1).
 *
 * <p>Transactions are programmatic and cover database work only. Hashing, token signing and mail
 * run outside them.
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final int BCRYPT_MAX_BYTES = 72;

    private final UserRepository users;
    private final UserProfileRepository profiles;
    private final UserRoleRepository roles;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final AccountMailer mailer;
    private final TransactionTemplate tx;
    private final AppProperties props;
    private final Clock clock;
    /** Verified against when the email is unknown, so response time does not reveal which emails exist. */
    private final String decoyHash;

    public AuthService(
            UserRepository users,
            UserProfileRepository profiles,
            UserRoleRepository roles,
            PasswordEncoder passwordEncoder,
            TokenService tokens,
            AccountMailer mailer,
            TransactionTemplate tx,
            AppProperties props,
            Clock clock) {
        this.users = users;
        this.profiles = profiles;
        this.roles = roles;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.mailer = mailer;
        this.tx = tx;
        this.props = props;
        this.clock = clock;
        this.decoyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    public AuthResponse register(RegisterRequest request) {
        requirePasswordWithinHashLimit(request.password());
        String email = normalizeEmail(request.email());
        String username = request.username();
        String displayName = request.displayName().trim();
        if (displayName.isEmpty()) {
            throw new BadRequestException(
                    "VALIDATION_ERROR", "Request validation failed.", List.of(new FieldIssue("displayName", "must not be blank")));
        }

        List<FieldIssue> duplicates = new ArrayList<>();
        if (users.existsByEmail(email)) {
            duplicates.add(new FieldIssue("email", "is already registered"));
        }
        if (users.existsByUsername(username)) {
            duplicates.add(new FieldIssue("username", "is already taken"));
        }
        if (!duplicates.isEmpty()) {
            throw new ConflictException("DUPLICATE_RESOURCE", "An account with these details already exists.", duplicates);
        }

        String hash = passwordEncoder.encode(request.password());
        // The unique constraints stay the source of truth: a concurrent duplicate fails on flush and
        // GlobalExceptionHandler turns the SQLSTATE 23505 into the same 409.
        User user = tx.execute(status -> {
            User saved = users.saveAndFlush(User.register(email, username, hash));
            profiles.saveAndFlush(UserProfile.create(saved.getId(), displayName));
            roles.saveAndFlush(UserRole.grant(saved.getId(), Role.USER, null));
            roles.saveAndFlush(UserRole.grant(saved.getId(), Role.CREATOR, null));
            return saved;
        });
        log.info("User registered: userId={}", user.getId());

        sendVerificationEmail(user, displayName);
        return session(user, Instant.now(clock));
    }

    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.email());
        User user = users.findByEmailAndDeletedAtIsNull(email).orElse(null);
        // No account can hold a password over the bcrypt limit (registration refuses it), so skip the encoder.
        boolean withinLimit = request.password().getBytes(StandardCharsets.UTF_8).length <= BCRYPT_MAX_BYTES;
        boolean matches = withinLimit
                && passwordEncoder.matches(request.password(), user != null ? user.getPasswordHash() : decoyHash);
        if (user == null || !matches) {
            log.info("Login rejected: invalid credentials");
            throw new UnauthorizedException("INVALID_CREDENTIALS", "Invalid email or password.");
        }
        if (user.getAccountStatus() != AccountStatus.ACTIVE) {
            log.info("Login rejected: userId={} status={}", user.getId(), user.getAccountStatus());
            throw new ForbiddenException(
                    user.getAccountStatus() == AccountStatus.SUSPENDED ? "ACCOUNT_SUSPENDED" : "ACCOUNT_DEACTIVATED",
                    "This account is not active.");
        }
        log.info("Login succeeded: userId={}", user.getId());
        return session(user, Instant.now(clock));
    }

    /**
     * Exchanges a valid refresh token for a new token pair. The new refresh token keeps the original
     * login time, so a session cannot be extended past {@code maxSessionAge}.
     */
    public AuthResponse refresh(String refreshToken) {
        Jwt jwt;
        try {
            jwt = tokens.parse(refreshToken, TokenUse.REFRESH);
        } catch (InvalidTokenException ex) {
            throw new UnauthorizedException("INVALID_REFRESH_TOKEN", "The refresh token is invalid or has expired.");
        }
        Instant authTime = Instant.ofEpochSecond(((Number) jwt.getClaim(TokenService.CLAIM_AUTH_TIME)).longValue());
        if (tokens.sessionTooOld(authTime)) {
            throw new UnauthorizedException("SESSION_EXPIRED", "The session has expired. Log in again.");
        }
        User user = users.findByIdAndDeletedAtIsNull(UUID.fromString(jwt.getSubject()))
                .filter(User::isActive)
                .orElseThrow(() -> new UnauthorizedException("INVALID_REFRESH_TOKEN", "The refresh token is invalid or has expired."));
        return session(user, authTime);
    }

    public AuthUserResponse me(UUID userId) {
        User user = users.findByIdAndDeletedAtIsNull(userId)
                .filter(User::isActive)
                .orElseThrow(() -> new UnauthorizedException("UNAUTHENTICATED", "Authentication is required or the token is invalid."));
        return toUserResponse(user, roleNames(user.getId()));
    }

    public void verifyEmail(String token) {
        Jwt jwt;
        try {
            jwt = tokens.parse(token, TokenUse.EMAIL_VERIFY);
        } catch (InvalidTokenException ex) {
            throw invalidVerification();
        }
        UUID userId = UUID.fromString(jwt.getSubject());
        String email = jwt.getClaimAsString(TokenService.CLAIM_EMAIL);
        tx.executeWithoutResult(status -> {
            User user = users.findByIdAndDeletedAtIsNull(userId).orElseThrow(AuthService::invalidVerification);
            if (!user.getEmail().equals(email)) {
                throw invalidVerification();
            }
            user.markEmailVerified(Instant.now(clock));
            users.saveAndFlush(user);
        });
        log.info("Email verified: userId={}", userId);
    }

    public void resendVerification(UUID userId) {
        User user = users.findByIdAndDeletedAtIsNull(userId)
                .filter(User::isActive)
                .orElseThrow(() -> new UnauthorizedException("UNAUTHENTICATED", "Authentication is required or the token is invalid."));
        if (user.isEmailVerified()) {
            throw new ConflictException("EMAIL_ALREADY_VERIFIED", "This email address is already verified.");
        }
        String displayName = profiles.findById(userId).map(UserProfile::getDisplayName).orElse(user.getUsername());
        sendVerificationEmail(user, displayName);
    }

    private AuthResponse session(User user, Instant authTime) {
        List<Role> userRoles = roleList(user.getId());
        String access = tokens.issueAccessToken(user.getId(), userRoles);
        String refresh = tokens.issueRefreshToken(user.getId(), authTime);
        return new AuthResponse(
                access,
                refresh,
                "Bearer",
                tokens.accessTokenTtl().toSeconds(),
                toUserResponse(user, userRoles.stream().map(Enum::name).sorted().toList()));
    }

    private AuthUserResponse toUserResponse(User user, List<String> roleNames) {
        UserProfile profile = profiles.findById(user.getId()).orElseThrow();
        return new AuthUserResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                profile.getDisplayName(),
                profile.getAvatarUrl(),
                profile.getBio(),
                roleNames,
                user.isEmailVerified(),
                user.getCreatedAt());
    }

    private List<Role> roleList(UUID userId) {
        return roles.findByUserId(userId).stream().map(UserRole::getRole).toList();
    }

    private List<String> roleNames(UUID userId) {
        return roleList(userId).stream().map(Enum::name).sorted().toList();
    }

    private void sendVerificationEmail(User user, String displayName) {
        try {
            String token = tokens.issueEmailVerificationToken(user.getId(), user.getEmail());
            String url = props.web().baseUrl().replaceAll("/+$", "") + "/verify-email?token=" + token;
            mailer.sendEmailVerification(user.getEmail(), displayName, url);
        } catch (RuntimeException ex) {
            // A mail failure must not fail registration. The user can request a new link.
            log.warn("Could not send verification email: userId={} reason={}", user.getId(), ex.getClass().getSimpleName());
        }
    }

    private static BadRequestException invalidVerification() {
        return new BadRequestException("INVALID_VERIFICATION_TOKEN", "The verification link is invalid or has expired.");
    }

    private static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    /** bcrypt only reads the first 72 bytes. Reject longer input instead of silently truncating it. */
    private static void requirePasswordWithinHashLimit(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new FieldIssue("password", "must be at most 72 bytes when encoded as UTF-8")));
        }
    }
}
