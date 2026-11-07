package com.aidrama.like;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.like.LikeDtos.LikeStateResponse;
import com.aidrama.security.AuthenticatedUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Like and unlike a video. Login required: the route is not permitAll in SecurityConfig, and
 * {@link AuthenticatedUser#from} answers 401 when no validated token is present. The user comes only from the
 * token. Both calls are idempotent and return the state after the call.
 */
@RestController
@RequestMapping(ApiPaths.BASE)
public class LikeController {

    private final LikeService likes;

    public LikeController(LikeService likes) {
        this.likes = likes;
    }

    @PostMapping("/videos/{slug}/like")
    public LikeStateResponse like(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return likes.like(slug, AuthenticatedUser.from(jwt));
    }

    @DeleteMapping("/videos/{slug}/like")
    public LikeStateResponse unlike(@PathVariable String slug, @AuthenticationPrincipal Jwt jwt) {
        return likes.unlike(slug, AuthenticatedUser.from(jwt));
    }
}
