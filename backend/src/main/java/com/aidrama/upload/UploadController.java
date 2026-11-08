package com.aidrama.upload;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.upload.UploadDtos.CompleteMultipartRequest;
import com.aidrama.upload.UploadDtos.InitiateUploadRequest;
import com.aidrama.upload.UploadDtos.UploadCompleteResponse;
import com.aidrama.upload.UploadDtos.UploadSessionResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Upload management (spec 7.5). Requires the CREATOR role. */
@RestController
@RequestMapping(ApiPaths.BASE + "/uploads")
public class UploadController {

    private final UploadService uploads;

    public UploadController(UploadService uploads) {
        this.uploads = uploads;
    }

    /** 201 for a new session, 200 when an {@code Idempotency-Key} replay returned the existing one. */
    @PostMapping("/initiate")
    public ResponseEntity<UploadSessionResponse> initiate(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody InitiateUploadRequest request) {
        UploadService.InitiateResult result = uploads.initiate(AuthenticatedUser.from(jwt), request, idempotencyKey);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.session());
    }

    @GetMapping("/{id}")
    public UploadSessionResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return uploads.get(AuthenticatedUser.from(jwt), id);
    }

    /** Safe to retry: completing an already completed session returns the same result. */
    @PostMapping("/{id}/complete")
    public UploadCompleteResponse complete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return uploads.complete(AuthenticatedUser.from(jwt), id);
    }

    /**
     * Confirms a chunked (multipart) upload. The body carries every part's number and the ETag the
     * storage returned for it. Safe to retry; a completed session returns the same result.
     */
    @PostMapping("/{id}/complete-multipart")
    public UploadCompleteResponse completeMultipart(
            @AuthenticationPrincipal Jwt jwt, @PathVariable UUID id, @Valid @RequestBody CompleteMultipartRequest request) {
        return uploads.completeMultipart(AuthenticatedUser.from(jwt), id, request.parts());
    }

    @PostMapping("/{id}/cancel")
    public UploadSessionResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return uploads.cancel(AuthenticatedUser.from(jwt), id);
    }
}
