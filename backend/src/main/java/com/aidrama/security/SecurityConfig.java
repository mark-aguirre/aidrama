package com.aidrama.security;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.common.exception.ErrorResponseWriter;
import com.aidrama.common.web.RequestIdFilter;
import com.aidrama.config.AppProperties;
import java.time.Clock;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.Map;

/**
 * Stateless bearer-token security. The API issues its own tokens (see {@link TokenService}) and
 * validates them as an OAuth2 resource server: signature, expiry, issuer, audience and purpose.
 *
 * <p>CSRF protection is off on purpose: authentication is a bearer token in the Authorization
 * header, never a cookie, so a cross-site request carries no credentials.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private static final String B = ApiPaths.BASE;

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        // Stored as "{bcrypt}$2a$12$...". The id prefix allows moving to Argon2 later without a forced reset.
        return new DelegatingPasswordEncoder("bcrypt", Map.of("bcrypt", new BCryptPasswordEncoder(12)));
    }

    @Bean
    JwtDecoder jwtDecoder(TokenService tokens) {
        return tokens.accessTokenDecoder();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, JwtDecoder decoder, ErrorResponseWriter errors)
            throws Exception {
        AuthenticationEntryPoint unauthorized = (request, response, ex) ->
                errors.write(response, HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authentication is required or the token is invalid.");
        AccessDeniedHandler forbidden = (request, response, ex) ->
                errors.write(response, HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to perform this action.");

        JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
        authorities.setAuthoritiesClaimName(TokenService.CLAIM_ROLES);
        authorities.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(authorities);

        http.cors(Customizer.withDefaults())
                .csrf(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(e -> e.authenticationEntryPoint(unauthorized).accessDeniedHandler(forbidden))
                .oauth2ResourceServer(o -> o.jwt(j -> j.decoder(decoder).jwtAuthenticationConverter(converter))
                        .authenticationEntryPoint(unauthorized)
                        .accessDeniedHandler(forbidden))
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/v3/api-docs", "/v3/api-docs/**").permitAll()
                        // Account endpoints that do not need a session.
                        .requestMatchers(HttpMethod.POST,
                                B + "/auth/register", B + "/auth/login", B + "/auth/refresh",
                                B + "/auth/logout", B + "/auth/verify-email").permitAll()
                        // Viewing is public, so reporting a view needs no login. A bearer token, when sent, identifies the viewer.
                        .requestMatchers(HttpMethod.POST, B + "/videos/*/view-events").permitAll()
                        // Likes belong to a user, so they always need a valid access token (401 otherwise). Listed explicitly so a future wildcard permitAll cannot expose them.
                        .requestMatchers(HttpMethod.POST, B + "/videos/*/like").authenticated()
                        .requestMatchers(HttpMethod.DELETE, B + "/videos/*/like").authenticated()
                        // Public discovery. The video status endpoint (/videos/*/processing-status) is not listed, so it requires login.
                        .requestMatchers(HttpMethod.GET,
                                B + "/home", B + "/videos", B + "/videos/*", B + "/search",
                                B + "/series", B + "/series/*").permitAll()
                        // Creator capabilities.
                        .requestMatchers(B + "/creator/**", B + "/uploads/**").hasRole("CREATOR")
                        .anyRequest().authenticated());
        return http.build();
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(AppProperties props) {
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(props.cors().allowedOrigins());
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "Idempotency-Key", RequestIdFilter.HEADER));
        cors.setExposedHeaders(List.of(RequestIdFilter.HEADER));
        cors.setAllowCredentials(false);
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration(B + "/**", cors);
        return source;
    }
}
