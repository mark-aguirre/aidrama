package com.aidrama.auth;

import com.aidrama.auth.AuthDtos.AuthResponse;
import com.aidrama.auth.AuthDtos.AuthUserResponse;
import com.aidrama.auth.AuthDtos.LoginRequest;
import com.aidrama.auth.AuthDtos.LogoutRequest;
import com.aidrama.auth.AuthDtos.RefreshRequest;
import com.aidrama.auth.AuthDtos.RegisterRequest;
import com.aidrama.auth.AuthDtos.VerifyEmailRequest;
import com.aidrama.common.api.ApiPaths;
import com.aidrama.security.AuthenticatedUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Authentication endpoints (spec 7.1). Transport and validation only. */
@RestController
@RequestMapping(ApiPaths.BASE + "/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return auth.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return auth.login(request);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return auth.refresh(request.refreshToken());
    }

    /**
     * Always 204. Tokens are stateless, so the server cannot revoke them; the client must discard both.
     * The body is optional and ignored.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestBody(required = false) @Valid LogoutRequest ignored) {
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public AuthUserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return auth.me(AuthenticatedUser.from(jwt).id());
    }

    @PostMapping("/verify-email")
    public ResponseEntity<Void> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        auth.verifyEmail(request.token());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/resend-verification")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendVerification(@AuthenticationPrincipal Jwt jwt) {
        auth.resendVerification(AuthenticatedUser.from(jwt).id());
    }
}
