package com.aidrama.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Request and response bodies of the auth endpoints (spec 7.1). */
public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Pattern(
                            regexp = "^[a-z0-9_]{3,30}$",
                            message = "must be 3 to 30 characters: lowercase letters, numbers and underscores")
                    String username,
            @NotBlank @Size(max = 50) String displayName,
            @NotBlank @Size(min = 8, max = 72, message = "must be 8 to 72 characters") String password) {}

    public record LoginRequest(
            @NotBlank @Email @Size(max = 254) String email, @NotBlank @Size(max = 72) String password) {}

    public record RefreshRequest(@NotBlank @Size(max = 4096) String refreshToken) {}

    /** Body is optional on logout; see the contract notes on statelessness. */
    public record LogoutRequest(@Size(max = 4096) String refreshToken) {}

    public record VerifyEmailRequest(@NotBlank @Size(max = 4096) String token) {}

    /** The signed-in user. Contains private fields (email), so it is only ever returned to the user themself. */
    public record AuthUserResponse(
            UUID id,
            String email,
            String username,
            String displayName,
            String avatarUrl,
            String bio,
            List<String> roles,
            boolean emailVerified,
            Instant createdAt) {}

    /** Result of register, login and refresh. */
    public record AuthResponse(
            String accessToken,
            String refreshToken,
            String tokenType,
            long expiresIn,
            AuthUserResponse user) {}
}
