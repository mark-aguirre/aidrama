package com.aidrama.view;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.view.ViewDtos.RecordViewRequest;
import com.aidrama.view.ViewDtos.RecordViewResponse;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Playback event reporting for view counts. Public: no login required, a bearer token only identifies the viewer. */
@RestController
@RequestMapping(ApiPaths.BASE)
public class ViewController {

    private final ViewService views;

    public ViewController(ViewService views) {
        this.views = views;
    }

    @PostMapping("/videos/{slug}/view-events")
    public RecordViewResponse record(
            @PathVariable String slug, @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody RecordViewRequest request) {
        AuthenticatedUser viewer = jwt == null ? null : AuthenticatedUser.from(jwt);
        return views.record(slug, request, viewer);
    }
}
