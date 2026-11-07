package com.aidrama.security;

import com.aidrama.common.exception.ForbiddenException;
import com.aidrama.common.exception.UnauthorizedException;
import com.aidrama.user.Role;
import java.util.Collection;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The caller, derived only from a validated access token. User id and roles are never read from
 * request bodies, query strings or headers other than the bearer token.
 */
public record AuthenticatedUser(UUID id, Set<Role> roles) {

    public AuthenticatedUser {
        roles = roles.isEmpty() ? EnumSet.noneOf(Role.class) : EnumSet.copyOf(roles);
    }

    public static AuthenticatedUser from(Jwt jwt) {
        if (jwt == null) {
            throw new UnauthorizedException("UNAUTHENTICATED", "Authentication is required.");
        }
        Collection<String> claim = jwt.getClaimAsStringList(TokenService.CLAIM_ROLES);
        Set<Role> roles = EnumSet.noneOf(Role.class);
        if (claim != null) {
            for (String name : claim) {
                try {
                    roles.add(Role.valueOf(name));
                } catch (IllegalArgumentException ignored) {
                    // Unknown role names carry no authority.
                }
            }
        }
        return new AuthenticatedUser(UUID.fromString(jwt.getSubject()), roles);
    }

    public boolean has(Role role) {
        return roles.contains(role);
    }

    /** Use-case level authorization check, independent of URL rules. */
    public void require(Role role) {
        if (!has(role)) {
            throw new ForbiddenException("FORBIDDEN", "You do not have permission to perform this action.");
        }
    }
}
