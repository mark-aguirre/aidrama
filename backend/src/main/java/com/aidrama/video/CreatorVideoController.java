package com.aidrama.video;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.common.api.PageParams;
import com.aidrama.common.api.Paginated;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.video.VideoDtos.CreateVideoRequest;
import com.aidrama.video.VideoDtos.LinkTrailerRequest;
import com.aidrama.video.VideoDtos.PublishRequest;
import com.aidrama.video.VideoDtos.UpdateVideoRequest;
import com.aidrama.video.VideoDtos.VideoResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Creator video management (spec 7.3). Requires the CREATOR role. */
@RestController
@RequestMapping(ApiPaths.BASE + "/creator/videos")
public class CreatorVideoController {

    private final CreatorVideoService service;

    public CreatorVideoController(CreatorVideoService service) {
        this.service = service;
    }

    @PostMapping
    public ResponseEntity<VideoResponse> create(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateVideoRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(AuthenticatedUser.from(jwt), request));
    }

    /** {@code q} is a case-insensitive substring match on the title; blank or absent lists everything. */
    @GetMapping
    public Paginated<VideoResponse> list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize,
            @RequestParam(required = false) PublicationStatus status,
            @RequestParam(required = false) String q) {
        return service.list(AuthenticatedUser.from(jwt), PageParams.of(page, pageSize), status, q);
    }

    @GetMapping("/{id}")
    public VideoResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.get(AuthenticatedUser.from(jwt), id);
    }

    @PutMapping("/{id}")
    public VideoResponse update(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody UpdateVideoRequest request) {
        return service.update(AuthenticatedUser.from(jwt), id, request);
    }

    @PostMapping("/{id}/publish")
    public VideoResponse publish(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody(required = false) PublishRequest request) {
        return service.publish(AuthenticatedUser.from(jwt), id, request);
    }

    /** Links a TRAILER video of the caller as this title's trailer (replaces the current one). Returns the updated title. */
    @PostMapping("/{id}/trailer")
    public VideoResponse linkTrailer(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody LinkTrailerRequest request) {
        return service.linkTrailer(AuthenticatedUser.from(jwt), id, request);
    }

    /** Removes the trailer link; the trailer video is kept. Idempotent. Returns the updated title (its {@code version} changes). */
    @DeleteMapping("/{id}/trailer")
    public VideoResponse unlinkTrailer(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.unlinkTrailer(AuthenticatedUser.from(jwt), id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        service.delete(AuthenticatedUser.from(jwt), id);
        return ResponseEntity.noContent().build();
    }
}
