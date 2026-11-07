package com.aidrama.upload;

import com.aidrama.common.api.ApiPaths;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.upload.UploadDtos.ProcessingStatusResponse;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Processing status of a creator's own video (spec 7.5). Requires login and ownership. */
@RestController
@RequestMapping(ApiPaths.BASE + "/videos")
public class ProcessingStatusController {

    private final ProcessingStatusService service;

    public ProcessingStatusController(ProcessingStatusService service) {
        this.service = service;
    }

    @GetMapping("/{id}/processing-status")
    public ProcessingStatusResponse processingStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return service.forOwner(AuthenticatedUser.from(jwt), id);
    }
}
